// Cuts the Nadelöhr assistant off from Vertex AI once its lifetime budget is
// nearly spent. Google Cloud budgets only report spending, they never stop
// it, so a budget notification on Pub/Sub is pushed here and this removes the
// Vertex express role from the service account the assistant's key belongs
// to. The key then gets 403s and the assistant says it is unavailable.
// Billing data arrives hours late, so the cut happens at STOP_AT of the budget
// (90% by default) to keep the true total under it.

export const ROLE = 'roles/aiplatform.expressUser';

/** The budget notification inside a Pub/Sub push envelope, or null. */
export function budgetNotice(envelope) {
  try {
    const data = envelope?.message?.data;
    if (typeof data !== 'string') return null;
    const notice = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    const cost = Number(notice.costAmount);
    const budget = Number(notice.budgetAmount);
    if (!Number.isFinite(cost) || !Number.isFinite(budget) || budget <= 0)
      return null;
    return { cost, budget, name: String(notice.budgetDisplayName || '') };
  } catch {
    return null;
  }
}

export function overCap({ cost, budget }, stopAt = 0.9) {
  return cost >= budget * stopAt;
}

/** The policy without `member` in ROLE, or null when it has no such grant. */
export function withoutGrant(policy, member) {
  let changed = false;
  const bindings = [];
  for (const binding of policy.bindings || []) {
    if (binding.role !== ROLE || !binding.members?.includes(member)) {
      bindings.push(binding);
      continue;
    }
    changed = true;
    const members = binding.members.filter((m) => m !== member);
    if (members.length) bindings.push({ ...binding, members });
  }
  return changed ? { ...policy, bindings } : null;
}

async function token() {
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!response.ok) throw new Error(`metadata token ${response.status}`);
  return (await response.json()).access_token;
}

async function crm(project, verb, body, auth) {
  const response = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:${verb}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok)
    throw new Error(`${verb} ${response.status} ${await response.text()}`);
  return response.json();
}

/** Removes the grant; true when it was there. */
export async function revoke(project, member) {
  const auth = await token();
  const policy = await crm(
    project,
    'getIamPolicy',
    { options: { requestedPolicyVersion: 3 } },
    auth,
  );
  const next = withoutGrant(policy, member);
  if (!next) return false;
  await crm(project, 'setIamPolicy', { policy: { ...next, version: 3 } }, auth);
  return true;
}
