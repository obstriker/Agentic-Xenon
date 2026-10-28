import type { CSSProperties } from "react";

// Shared by the preview pages: ways to configure a component, to show that every colour and word can be changed.
export type Variant = "default" | "light" | "spanish";
export const VARIANTS: { id: Variant; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "light", label: "Light theme" },
  { id: "spanish", label: "Spanish labels" },
];
export const pageStyle = (variant: Variant, dark: string): CSSProperties => ({ background: variant === "light" ? "#e9ebf1" : dark, minHeight: "100vh", margin: "-28px -36px", padding: "28px 36px 60px" });
export const pillStyle = (on: boolean): CSSProperties => ({ font: "inherit", fontSize: 14, padding: "8px 14px", borderRadius: 10, cursor: "pointer", border: "1px solid #34343a", background: on ? "#f4f4f6" : "#232326", color: on ? "#111" : "#d8d8de" });
