import Link from "next/link";

export default function Landing() {
  return (
    <main>
      <nav className="landing-nav">
        <div className="brand">
          <span className="brand-mark">S</span> Sage
        </div>
        <div className="flex-gap">
          <Link href="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-accent">
            Sign up free
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <h1>Know where your money goes, and where it should.</h1>
          <p>
            Track every income source, split your earnings into savings and budgets
            automatically, and watch your stock holdings, including Pakistan Stock
            Exchange shares, all in one calm dashboard.
          </p>
          <Link href="/signup" className="btn btn-accent">
            Create your free account
          </Link>
        </div>
        <div className="hero-card">
          <div className="hero-label">This month</div>
          <div className="big">Rs 185,000</div>
          <div className="hero-label mt-14">Spent so far</div>
          <div className="hero-bar">
            <span className="w-58"/>
          </div>
          <div className="hero-label">Savings goal</div>
          <div className="hero-bar">
            <span className="w-82"/>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="card">
          <h3>Many income sources</h3>
          <p>Add your job, side hustles and more, each tracked on its own.</p>
        </div>
        <div className="card">
          <h3>Automatic budgets</h3>
          <p>Set a percentage or fixed amount to put aside from your income.</p>
        </div>
        <div className="card">
          <h3>Spending history</h3>
          <p>See what you earned and spent each month, broken down by category.</p>
        </div>
        <div className="card">
          <h3>Stock tracker</h3>
          <p>Keep your holdings with live PSX prices and gain or loss at a glance.</p>
        </div>
      </section>
    </main>
  );
}
