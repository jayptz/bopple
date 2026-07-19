export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
        <span className="text-[14px] font-medium text-white">Bopple</span>
        <span className="text-[12px] text-[#555]">
          MIT · {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
