import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), reset: vi.fn(), update: vi.fn(), signOut: vi.fn(async () => ({})), exchange: vi.fn(), getUser: vi.fn(), aal: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }), clear: vi.fn(),
  impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: s.push, refresh: s.refresh }), usePathname: () => "/join", redirect: s.redirect }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithPassword: s.signIn, signUp: s.signUp, resetPasswordForEmail: s.reset, updateUser: s.update, signOut: s.signOut, signInWithOAuth: vi.fn(), mfa: { getAuthenticatorAssuranceLevel: s.aal } } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: s.getUser, exchangeCodeForSession: s.exchange, mfa: { getAuthenticatorAssuranceLevel: s.aal } } }) }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: () => undefined, setApiSpace: vi.fn(), clearApiCache: s.clear, requestsWaiting: () => 0, API_URL: "http://api.test" }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({}));

import ErrorPage from "@/app/error";
import ForgotPasswordPage from "@/app/forgot-password/page";
import LoginPage from "@/app/login/page";
import NotFound from "@/app/not-found";
import ResetPasswordPage from "@/app/reset-password/page";
import SignupPage from "@/app/signup/page";
import JoinPage from "@/app/(app)/join/page";
import MorePage from "@/app/(app)/more/page";
import AppLayout from "@/app/(app)/layout";
import { GET as callback } from "@/app/auth/callback/route";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi(routes); s.impl = api.impl as typeof s.impl; };
beforeEach(() => {
  for (const f of [s.push, s.refresh, s.signIn, s.signUp, s.reset, s.update, s.signOut, s.exchange, s.getUser, s.aal, s.clear]) f.mockReset();
  s.signOut.mockResolvedValue({});
  window.history.replaceState(null, "", "/");
  use({ "/households/me": { household: null } });
});

const type = async (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text);

describe("login", () => {
  const submit = async (email = "a@b.co", pw = "secret-password") => { await type("Email", email); await type("Password", pw); await userEvent.click(screen.getByRole("button", { name: "Log in" })); };
  it("signs in and opens the dashboard", async () => {
    s.signIn.mockResolvedValue({ error: null });
    render(<LoginPage />);
    await submit();
    expect(s.signIn).toHaveBeenCalledWith({ email: "a@b.co", password: "secret-password" });
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/dashboard"));
    expect(s.refresh).toHaveBeenCalled();
  });
  it("asks for the authenticator code next when two-step sign-in is on", async () => {
    s.signIn.mockResolvedValue({ error: null });
    s.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
    window.history.replaceState(null, "", "/login?next=/budget");
    render(<LoginPage />);
    await submit();
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/verify?next=%2Fbudget"));
  });
  it("offers Google sign-in", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
  it("shows the reason when sign in fails and lets you try again", async () => {
    s.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<LoginPage />);
    await submit();
    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(s.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });
  it("disables the button while signing in", async () => {
    s.signIn.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);
    await submit();
    expect(await screen.findByRole("button", { name: "Logging in..." })).toBeDisabled();
  });
  it("needs an email and a password", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });
  it("links to sign up and password reset", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });
  it.each([["/join?token=abc", "/join?token=abc"], ["/budget", "/budget"]])("returns to %s after login", async (next, want) => {
    window.history.replaceState(null, "", `/login?next=${encodeURIComponent(next)}`);
    s.signIn.mockResolvedValue({ error: null });
    render(<LoginPage />); await submit();
    await waitFor(() => expect(s.push).toHaveBeenCalledWith(want));
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/", "/1abc", ""])("never goes to %j after login", async (next) => {
    window.history.replaceState(null, "", `/login?next=${encodeURIComponent(next)}`);
    s.signIn.mockResolvedValue({ error: null });
    render(<LoginPage />); await submit();
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("signup", () => {
  const fill = async () => { await type("Full name", "Ayesha Khan"); await type("Email", "a@b.co"); await type("Password", "long-enough-pw"); await userEvent.click(screen.getByRole("button", { name: "Sign up" })); };
  it("creates the account with the name and a confirmation link", async () => {
    s.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<SignupPage />); await fill();
    expect(s.signUp).toHaveBeenCalledWith({ email: "a@b.co", password: "long-enough-pw", options: { data: { full_name: "Ayesha Khan" }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` } });
    expect(await screen.findByText("Check your email to confirm your account, then log in.")).toBeInTheDocument();
    expect(s.push).not.toHaveBeenCalled();
  });
  it("goes straight in when no confirmation is needed", async () => {
    s.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    render(<SignupPage />); await fill();
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/dashboard"));
  });
  it("shows an error", async () => {
    s.signUp.mockResolvedValue({ data: {}, error: { message: "User already registered" } });
    render(<SignupPage />); await fill();
    expect(await screen.findByText("User already registered")).toBeInTheDocument();
  });
  it("asks for ten characters and every field", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "10");
    for (const l of ["Full name", "Email", "Password"]) expect(screen.getByLabelText(l)).toBeRequired();
  });
  it("links back to log in", () => { render(<SignupPage />); expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login"); });
});

describe("signup extras", () => {
  it("offers Google sign-up", () => {
    render(<SignupPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});

describe("forgot password", () => {
  it("sends a reset link without revealing whether the email exists", async () => {
    s.reset.mockResolvedValue({ error: null });
    render(<ForgotPasswordPage />);
    await type("Email", "a@b.co"); await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(s.reset).toHaveBeenCalledWith("a@b.co", { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    expect(await screen.findByText("If that email has an account, a reset link is on its way.")).toBeInTheDocument();
  });
  it("shows an error from the server", async () => {
    s.reset.mockResolvedValue({ error: { message: "Rate limit" } });
    render(<ForgotPasswordPage />);
    await type("Email", "a@b.co"); await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Rate limit")).toBeInTheDocument();
  });
  it("links back to log in", () => { render(<ForgotPasswordPage />); expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login"); });
});

describe("reset password", () => {
  it("saves a new password and opens the dashboard", async () => {
    s.update.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);
    await type("New password", "a-brand-new-pass"); await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(s.update).toHaveBeenCalledWith({ password: "a-brand-new-pass" });
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/dashboard"));
  });
  it("shows an error and stays", async () => {
    s.update.mockResolvedValue({ error: { message: "Password too weak" } });
    render(<ResetPasswordPage />);
    await type("New password", "a-brand-new-pass"); await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("Password too weak")).toBeInTheDocument();
    expect(s.push).not.toHaveBeenCalled();
  });
  it("needs ten characters", () => { render(<ResetPasswordPage />); expect(screen.getByLabelText("New password")).toHaveAttribute("minLength", "10"); });
});

describe("join a household", () => {
  const withToken = (t: string) => window.history.replaceState(null, "", `/join${t ? `?token=${t}` : ""}`);
  it("explains a link with no code", async () => {
    withToken("");
    renderApp(<JoinPage />);
    expect(await screen.findByText(/missing its code/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join household" })).toBeNull();
  });
  it("takes the code out of the address bar", async () => {
    withToken("a".repeat(40));
    renderApp(<JoinPage />);
    await screen.findByRole("button", { name: "Join household" });
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/join");
  });
  it("joins, switches to the household and opens the dashboard", async () => {
    withToken("t".repeat(40));
    use({ "/households/me": { household: null }, "POST /households/join": { household_id: uid(9) } });
    renderApp(<JoinPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Join household" }));
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/dashboard"));
    expect(api.sent("POST", "/households/join")[0].body).toEqual({ token: "t".repeat(40) });
    expect(localStorage.getItem("cl-space")).toBe(uid(9));
    expect(await screen.findByRole("status")).toHaveTextContent("You joined the household");
  });
  it("accepts an id in either field", async () => {
    withToken("t".repeat(40));
    use({ "/households/me": { household: null }, "POST /households/join": { id: uid(8) } });
    renderApp(<JoinPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Join household" }));
    await waitFor(() => expect(localStorage.getItem("cl-space")).toBe(uid(8)));
  });
  it("shows why it failed and lets you retry", async () => {
    withToken("t".repeat(40));
    use({ "/households/me": { household: null }, "POST /households/join": new Error("This invitation has expired") });
    renderApp(<JoinPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Join household" }));
    expect(await screen.findByText("This invitation has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join household" })).toBeEnabled();
    expect(s.push).not.toHaveBeenCalled();
  });
});

describe("state pages", () => {
  it("not found offers the way home", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/dashboard");
  });
  it("error page reassures and can retry", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("x")} reset={reset} />);
    expect(screen.getByText(/Your data is safe/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeInTheDocument();
  });
});

describe("More page", () => {
  it("lists every other page", () => {
    render(<MorePage />);
    for (const [name, href] of [["Goals", "/goals"], ["Stocks", "/stocks"], ["Tax and income", "/freelancer"], ["Household", "/household"], ["Ask your money", "/ask"], ["Income sources", "/income"], ["Categories", "/categories"], ["Recurring", "/recurring"], ["Notifications", "/notifications"], ["Settings", "/settings"]]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute("href", href);
    }
  });
  it("logs out", async () => {
    render(<MorePage />);
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/login"));
    expect(s.clear).toHaveBeenCalled();
    expect(s.signOut).toHaveBeenCalled();
  });
});

describe("app layout", () => {
  it("sends a signed out visitor to login", async () => {
    s.getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: <p>x</p> })).rejects.toThrow("REDIRECT:/login");
  });
  it("sends someone who still owes their two-step code to the code page", async () => {
    s.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "me@example.com" } } });
    s.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
    await expect(AppLayout({ children: <p>x</p> })).rejects.toThrow("REDIRECT:/verify");
  });
  it("wraps the page for a signed in person", async () => {
    sessionStorage.setItem("cl-server-awake", String(Date.now()));
    s.getUser.mockResolvedValue({ data: { user: { email: "me@example.com" } } });
    renderApp(await AppLayout({ children: <p>inside</p> }));
    expect(await screen.findByText("inside")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    // The layout is not on the dashboard here (the path is mocked as /join), so no floating add button.
    expect(screen.queryByRole("button", { name: "Add a transaction" })).not.toBeInTheDocument();
  });
});

describe("sign in callback route", () => {
  const call = (qs: string) => callback(new Request(`https://app.test/auth/callback${qs}`));
  it("completes sign in and goes where it was asked", async () => {
    s.exchange.mockResolvedValue({ error: null });
    const res = await call("?code=abc&next=/reset-password");
    expect(s.exchange).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://app.test/reset-password");
  });
  it("defaults to the dashboard", async () => { s.exchange.mockResolvedValue({ error: null }); expect((await call("?code=abc")).headers.get("location")).toBe("https://app.test/dashboard"); });
  it.each(["//evil.example", "https://evil.example", "evil.example"])("never redirects to %s", async (next) => {
    s.exchange.mockResolvedValue({ error: null });
    expect((await call(`?code=abc&next=${encodeURIComponent(next)}`)).headers.get("location")).toBe("https://app.test/dashboard");
  });
  it("goes to login when the code is bad", async () => { s.exchange.mockResolvedValue({ error: { message: "bad" } }); expect((await call("?code=abc")).headers.get("location")).toBe("https://app.test/login"); });
  it("goes to login without a code", async () => { const res = await call(""); expect(res.headers.get("location")).toBe("https://app.test/login"); expect(s.exchange).not.toHaveBeenCalled(); });
});
