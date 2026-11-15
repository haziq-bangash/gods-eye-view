import { cva } from 'class-variance-authority';

/** shadcn-vue button variants, tuned for Apple-style round controls. */
export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,transform,box-shadow] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:brightness-105',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'bg-transparent hover:bg-accent',
        glass: 'glass text-foreground hover:brightness-[1.03]',
        outline: 'border border-border bg-transparent hover:bg-accent',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
