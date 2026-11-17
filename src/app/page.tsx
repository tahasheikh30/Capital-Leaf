import Link from "next/link";
import AppFooter from "@/components/AppFooter";
import LandingHeader from "@/components/LandingHeader";
import {
  ChartNoAxesCombined,
  ChartPie,
  Check,
  Download,
  GitBranch,
  Leaf,
  ReceiptText,
  Repeat,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import WarmUp from "@/components/WarmUp";
import "./landing.css";

export default function Landing() {
  return (
    <div className="lp" id="top">
      <WarmUp />
      <LandingHeader />

      <main>
        <section className="lp-hero">
          <div className="lp-hero-in">
            <div className="lp-rise">
              <p className="lp-eyebrow">Your money, made clear</p>
              <h1 className="lp-display">Make room for what matters.</h1>
              <p className="lp-hero-copy">
                Know where your money comes from, where it goes, and what it could do next. Capital Leaf brings your income, spending, budgets and
                Pakistan Stock Exchange holdings into one calm dashboard.
              </p>
              <div className="lp-hero-cta">
                <Link href="/signup" className="lp-btn lp-btn-tomato lp-btn-lg">
                  Create your free account
                </Link>
                <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-lg">
                  Log in
                </Link>
              </div>
              <p className="lp-hero-note">Free to start. Works on your phone like an app.</p>
            </div>

            <div className="lp-visual lp-rise-2">
              <div className="lp-panel">
                <div className="lp-panel-head">
                  <div>
                    <p className="lp-panel-label">This month</p>
                    <p className="lp-panel-amount lp-display">Rs 185,000 earned</p>
                  </div>
                  <span className="lp-tag">At a glance</span>
                </div>
                <svg className="lp-bars" viewBox="0 0 140 56" preserveAspectRatio="none" aria-hidden="true">
                  <rect x="0" y="32" width="16" height="24" rx="3" className="lp-bar-a" />
                  <rect x="20" y="19" width="16" height="37" rx="3" className="lp-bar-b" />
                  <rect x="40" y="27" width="16" height="29" rx="3" className="lp-bar-a" />
                  <rect x="60" y="11" width="16" height="45" rx="3" className="lp-bar-c" />
                  <rect x="80" y="21" width="16" height="35" rx="3" className="lp-bar-a" />
                  <rect x="100" y="0" width="16" height="56" rx="3" className="lp-bar-hot" />
                  <rect x="120" y="13" width="16" height="43" rx="3" className="lp-bar-b" />
                </svg>
                <div className="lp-two">
                  <div className="lp-stat lp-stat-in">
                    <small>Money in</small>
                    <strong>Job and side hustle</strong>
                  </div>
                  <div className="lp-stat lp-stat-out">
                    <small>Money out</small>
                    <strong>By category</strong>
                  </div>
                </div>
                <p className="lp-disclaimer">Illustrative preview. Not live financial data.</p>
              </div>
              <div className="lp-chip">
                <span className="lp-chip-icon" aria-hidden="true">
                  <TrendingUp size={20} />
                </span>
                Live PSX prices for your shares
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-cream">
          <div className="lp-wrap lp-split">
            <div>
              <p className="lp-eyebrow">The big picture</p>
              <h2 className="lp-h2 lp-display">Everything in its right place.</h2>
              <p className="lp-lead">From the small purchases to the bigger plans, see the pieces of your financial life together in one thoughtful view.</p>
              <ul className="lp-points">
                <li>
                  <Check size={18} /> Six months of earned versus spent, at a glance
                </li>
                <li>
                  <Check size={18} /> Spending broken down by your own categories
                </li>
                <li>
                  <Check size={18} /> Rupees by default, with your time zone respected
                </li>
              </ul>
            </div>
            <div className="lp-panel">
              <div className="lp-panel-head">
                <div>
                  <p className="lp-panel-label">Where it went</p>
                  <p className="lp-panel-amount lp-display">A clearer picture</p>
                </div>
                <span className="lp-tag">By category</span>
              </div>
              <div className="lp-cats" aria-hidden="true">
                {[
                  ["Rent", 100, "var(--lp-deep)"],
                  ["Groceries", 62, "#6f8f6a"],
                  ["Transport", 38, "#91b395"],
                  ["Eating out", 24, "#e65b45"],
                ].map(([name, pct, color]) => (
                  <div className="lp-cat-row" key={name as string}>
                    <span>{name}</span>
                    <span className="lp-cat-track">
                      <svg viewBox="0 0 100 10" preserveAspectRatio="none">
                        <rect width={pct as number} height="10" fill={color as string} />
                      </svg>
                    </span>
                    <strong>{pct}%</strong>
                  </div>
                ))}
              </div>
              <p className="lp-disclaimer">Illustrative preview. Not live financial data.</p>
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Built for real life</p>
            <h2 className="lp-h2 lp-display">The little details. The bigger picture.</h2>
            <div className="lp-grid4">
              <article className="lp-card lp-c1">
                <span className="lp-card-icon" aria-hidden="true">
                  <ReceiptText />
                </span>
                <h3>Every transaction</h3>
                <p>Keep a clear record of what comes in and what goes out. Edit anything, any time.</p>
              </article>
              <article className="lp-card lp-c2">
                <span className="lp-card-icon" aria-hidden="true">
                  <GitBranch />
                </span>
                <h3>Income, explained</h3>
                <p>Add your job, side hustles and more, and see exactly where each rupee comes from.</p>
              </article>
              <article className="lp-card lp-c3">
                <span className="lp-card-icon" aria-hidden="true">
                  <ChartPie />
                </span>
                <h3>Budgets that fit</h3>
                <p>Set aside a percentage or a fixed amount from your income, and see what is left to spend.</p>
              </article>
              <article className="lp-card lp-c4">
                <span className="lp-card-icon" aria-hidden="true">
                  <ChartNoAxesCombined />
                </span>
                <h3>Stock holdings</h3>
                <p>Track your PSX shares with live prices and your gain or loss, next to everyday money.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="plan" className="lp-section lp-sage">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Look ahead</p>
            <h2 className="lp-h2 lp-display">A plan for what is next.</h2>
            <p className="lp-lead">Set things up once and let Capital Leaf keep up, wherever you are.</p>
            <div className="lp-grid3">
              <article className="lp-big">
                <span className="lp-big-icon" aria-hidden="true">
                  <Repeat />
                </span>
                <h3 className="lp-display">Bills that add themselves</h3>
                <p>Rent, salary and subscriptions repeat weekly, monthly or yearly. They appear on time, and you can pause or stop them whenever you like.</p>
              </article>
              <article className="lp-big">
                <span className="lp-big-icon lp-big-icon-hot" aria-hidden="true">
                  <ChartPie />
                </span>
                <h3 className="lp-display">Savings on autopilot</h3>
                <p>Turn your income into a plan. Put aside a share or a set amount first, then budget the rest with confidence.</p>
              </article>
              <article className="lp-big">
                <span className="lp-big-icon" aria-hidden="true">
                  <Smartphone />
                </span>
                <h3 className="lp-display">On your phone</h3>
                <p>Add it to your home screen and it opens like an app, with quick tabs for the screens you use most.</p>
              </article>
            </div>
            <p className="lp-fine">Stock prices come from a public market data source and may be delayed. Nothing here is financial advice.</p>
          </div>
        </section>

        <section id="privacy" className="lp-section lp-cream">
          <div className="lp-wrap lp-split">
            <div>
              <p className="lp-eyebrow">Your data stays yours</p>
              <h2 className="lp-h2 lp-display">Private by design.</h2>
              <p className="lp-lead">Your records are tied to your account alone, and you stay in control of them.</p>
            </div>
            <ul className="lp-points">
              <li>
                <ShieldCheck size={20} /> Secure login with email confirmation and password reset
              </li>
              <li>
                <ShieldCheck size={20} /> No one else can see your numbers. Every request is checked against your account
              </li>
              <li>
                <Download size={20} /> Download your transactions as a spreadsheet, or everything as a file, whenever you want
              </li>
              <li>
                <Check size={20} /> Delete your account and all your data permanently, in one step
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-close">
          <div className="lp-wrap lp-close-in">
            <div>
              <h2 className="lp-display">Feel good about knowing more.</h2>
              <p>Start free and see your whole month in a few minutes.</p>
            </div>
            <Link href="/signup" className="lp-btn lp-btn-tomato lp-btn-lg">
              Create your free account
            </Link>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
