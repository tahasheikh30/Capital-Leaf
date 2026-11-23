import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import TagInput from "@/components/TagInput";

function Harness({ start = [], suggestions = [] as string[] }: { start?: string[]; suggestions?: string[] }) {
  const [v, set] = useState(start);
  return (
    <>
      <TagInput value={v} onChange={set} suggestions={suggestions} />
      <output data-testid="out">{v.join("|")}</output>
    </>
  );
}
const out = () => screen.getByTestId("out").textContent;

describe("TagInput", () => {
  it("adds a tag with Enter", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Tags"), "Business{Enter}");
    expect(out()).toBe("business");
  });
  it("adds a tag with a comma", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Tags"), "a,b,");
    expect(out()).toBe("a|b");
  });
  it("adds a tag when leaving the box", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Tags"), "trip");
    await userEvent.tab();
    expect(out()).toBe("trip");
  });
  it("does not add a repeat", async () => {
    render(<Harness start={["a"]} />);
    await userEvent.type(screen.getByLabelText("Tags"), "A{Enter}");
    expect(out()).toBe("a");
  });
  it("removes a tag with its button", async () => {
    render(<Harness start={["a", "b"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
    expect(out()).toBe("b");
  });
  it("Backspace on an empty box removes the last tag", async () => {
    render(<Harness start={["a", "b"]} />);
    await userEvent.type(screen.getByLabelText("Tags"), "{Backspace}");
    expect(out()).toBe("a");
  });
  it("explains a tag it refuses", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Tags"), "a$b{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/letters, numbers/);
    expect(out()).toBe("");
    await userEvent.type(screen.getByLabelText("Tags"), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("stops at eight tags", () => {
    render(<Harness start={["1", "2", "3", "4", "5", "6", "7", "8"]} />);
    expect(screen.queryByLabelText("Tags")).toBeNull();
  });
  it("offers suggestions that are not already used", () => {
    const { container } = render(<Harness start={["a"]} suggestions={["a", "b", "c"]} />);
    expect([...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))).toEqual(["b", "c"]);
  });
});
