import icon from "@/assets/spenny-icon.png";

const sizes = {
  sm: { icon: "h-7 w-7", text: "text-lg" },
  md: { icon: "h-9 w-9", text: "text-2xl" },
  lg: { icon: "h-11 w-11", text: "text-3xl" },
} as const;

export function SpennyIcon({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src={icon}
      alt="Too Spenny"
      width={302}
      height={301}
      className={"rounded-[22%] object-contain " + className}
    />
  );
}

export function SpennyLogo({
  size = "md",
  className = "",
  textClassName = "",
}: {
  size?: keyof typeof sizes;
  className?: string;
  textClassName?: string;
}) {
  const s = sizes[size];
  return (
    <span className={"flex items-center gap-1.5 " + className}>
      <SpennyIcon className={s.icon} />
      <span
        className={`font-display font-bold tracking-[-0.03em] ${s.text} ${textClassName || "text-foreground"}`}
      >
        Too Spenny
      </span>
    </span>
  );
}
