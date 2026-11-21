import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use, CoinLeaf" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="17 November 2026">
      <p>By using CoinLeaf you agree to these terms.</p>

      <h2>A tool, not advice</h2>
      <p>CoinLeaf helps you keep track of your money. It does not give financial, tax, investment or legal advice. Figures such as the tax set aside are estimates based on what you enter. Check them with the tax authority or an adviser before you rely on them.</p>

      <h2>Market data</h2>
      <p>Prices, rates and dividends come from third parties and may be delayed, incomplete or wrong. Do not trade on them alone.</p>

      <h2>AI answers</h2>
      <p>AI features can make mistakes. They answer only from the figures in your account and may misread them. Treat their answers as a starting point.</p>

      <h2>Your account</h2>
      <p>Keep your password private. You are responsible for what happens under your account, and for the accuracy of what you enter. You may stop using CoinLeaf and delete your account at any time in Settings.</p>

      <h2>No warranty</h2>
      <p>CoinLeaf is provided as it is, without promises that it will always be available or free of errors. To the extent the law allows, we are not liable for losses that come from using it.</p>

      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows when they last changed.</p>
    </LegalPage>
  );
}
