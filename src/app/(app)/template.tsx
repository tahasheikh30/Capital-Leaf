// A template is created again on every navigation, so each page fades in as you move between them.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
