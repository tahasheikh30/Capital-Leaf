import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy, Capital Leaf" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="17 November 2026">
      <p>Capital Leaf is a personal finance tracker. This page explains what it stores about you, who else sees it and how to take it back.</p>

      <h2>What we store</h2>
      <p>Your email address and password (the password is handled by our sign-in provider and we never see it), and the things you enter: transactions, categories, budget rules, repeating items, net worth items, stock holdings, dividends, price alerts and your settings. If you use a household, its members can see the household's shared transactions and budget.</p>

      <h2>Where it lives</h2>
      <p>Your data is kept in a Supabase database. Only our server reads it, and it checks on every request that the data belongs to you or to a household you are in.</p>

      <h2>Who else receives data</h2>
      <ul>
        <li><strong>AI features</strong> are off until you turn them on in Settings. When on, a short summary of your figures (totals, category totals and common notes) or the notes of transactions you ask to categorize is sent to our AI provider, OpenRouter, to answer you.</li>
        <li><strong>Price alert emails</strong> are sent through Resend and contain your email address and the alert.</li>
        <li><strong>Market data</strong> is fetched from public sources. Your data is never sent to them.</li>
      </ul>

      <h2>What we do not do</h2>
      <p>We do not sell your data, show advertising or build profiles for other companies.</p>

      <h2>Your choices</h2>
      <p>In Settings you can download all your data and delete your account. Deleting removes your data from our database.</p>

      <h2>Contact</h2>
      <p>Questions about this policy can be raised on the project's <a href="https://github.com/tahasheikh30/Capital-Leaf" target="_blank" rel="noopener noreferrer">GitHub page</a>.</p>
    </LegalPage>
  );
}
