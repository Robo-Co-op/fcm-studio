export type LineThickness = "thin" | "normal" | "thick";

export const LINE_THICKNESS_LABELS: Record<LineThickness, string> = {
  thin: "Thin lines",
  normal: "Normal lines",
  thick: "Thick lines",
};

export const LINE_THICKNESSES = Object.keys(
  LINE_THICKNESS_LABELS,
) as LineThickness[];

const POSITIVE_COLOR = "#4c927c";
const NEGATIVE_COLOR = "#cf766c";

// 基本の太さ + 重みの絶対値に比例する分。thin は従来の描き方と同じ
const WIDTH: Record<LineThickness, { base: number; perWeight: number }> = {
  thin: { base: 1, perWeight: 2 },
  normal: { base: 2, perWeight: 4 },
  thick: { base: 3, perWeight: 6 },
};

// 行列の貼り付けなどで生じる浮動小数点の誤差をラベルに出さない
export function formatWeight(weight: number): string {
  const size = Number(Math.abs(weight).toFixed(2));
  if (size === 0) return "0";
  return `${weight > 0 ? "+" : "−"}${size}`;
}

export interface EdgeAppearance {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

export function edgeAppearance(
  weight: number,
  thickness: LineThickness,
  active: boolean,
): EdgeAppearance {
  const { base, perWeight } = WIDTH[thickness];
  const strokeWidth = base + Math.abs(weight) * perWeight + (active ? 2 : 0);
  if (weight < 0)
    return {
      stroke: NEGATIVE_COLOR,
      strokeWidth,
      strokeDasharray: `${strokeWidth * 3} ${strokeWidth * 2}`,
    };
  return { stroke: POSITIVE_COLOR, strokeWidth };
}

const THICKNESS_KEY = "fcm-studio-line-thickness";

type ThicknessStorage = Pick<Storage, "getItem" | "setItem">;

// 表示の好みなので、読めない・書けない環境では既定値で動き続ける
export function loadLineThickness(
  storage: ThicknessStorage | undefined,
): LineThickness {
  try {
    const saved = storage?.getItem(THICKNESS_KEY);
    return LINE_THICKNESSES.find((value) => value === saved) ?? "normal";
  } catch {
    return "normal";
  }
}

export function saveLineThickness(
  storage: ThicknessStorage | undefined,
  thickness: LineThickness,
): void {
  try {
    storage?.setItem(THICKNESS_KEY, thickness);
  } catch {
    // 保存できなくても、このセッションの表示には反映される
  }
}
