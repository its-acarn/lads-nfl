import Sidebar from "./Sidebar";

export default function Layout({ children }: any) {
  return (
    <Sidebar>{children}</Sidebar>
  )
}