import { Phone, PhoneOff } from "lucide-react"

/** A small phone showing the incoming call, so people know what to expect. CSS-only animation. */
export function PhoneMockup({ ringing = true }: { ringing?: boolean }) {
  return (
    <div className="relative mx-auto h-[300px] w-[160px]" aria-hidden>
      {ringing &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-brand/25 motion-reduce:hidden"
            style={{ animationDelay: `${i * 0.6}s`, animationDuration: "2.4s" }}
          />
        ))}
      <div className="relative flex h-full flex-col items-center overflow-hidden rounded-[2rem] border-[6px] border-foreground/90 bg-linear-to-b from-[#0a3f78] to-[#04203f] px-3 pt-8 pb-5 text-white shadow-2xl">
        <span className="absolute top-1.5 h-1.5 w-12 rounded-full bg-foreground/90" />
        <span className="text-[10px] tracking-wider text-white/60 uppercase">Incoming call</span>
        <span className="mt-6 grid size-14 place-items-center rounded-full bg-white/15 text-lg font-semibold">R</span>
        <span className="mt-3 text-center text-sm leading-tight font-medium">Regeneron research team</span>
        <span className="mt-1 text-[10px] text-white/60">Ava · automated assistant</span>
        <div className="mt-auto flex w-full justify-around">
          <span className="grid size-10 place-items-center rounded-full bg-red-500">
            <PhoneOff className="size-4" />
          </span>
          <span className="grid size-10 place-items-center rounded-full bg-emerald-500 motion-safe:animate-bounce">
            <Phone className="size-4" />
          </span>
        </div>
      </div>
    </div>
  )
}
