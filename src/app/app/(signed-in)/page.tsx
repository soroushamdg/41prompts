import { Topbar } from "@/components/shell/topbar";

export const metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <Topbar />
      <main id="main" style={{ padding: 32 }}>
        <h1>Library</h1>
      </main>
    </>
  );
}
