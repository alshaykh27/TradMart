import type { Dictionary } from "@/i18n";

export default function Footer({ dict }: { dict: Dictionary }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <p>
          © {new Date().getFullYear()} {dict.brand}. {dict.footer.rights}
        </p>
        <p>{dict.tagline}</p>
      </div>
    </footer>
  );
}
