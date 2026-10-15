import { Navbar } from "@/components/layout/Navbar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}