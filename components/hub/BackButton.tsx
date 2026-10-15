"use client";

export function BackButton() {
  return (
    <button onClick={() => history.back()} className="text-xs text-river-light hover:underline">
      ← Back
    </button>
  );
}