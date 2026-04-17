/**
 * UI gradient primary color per letter grade (SSS…F + legacy AAAA…AA from old saves).
 * S 档及以上统一金色系，其余按常见音游阶梯：绿→蓝→橙→红→褐灰。
 */
export function gradePrimaryColor(grade: string): string {
  const g = grade.trim();
  if (g === "SSS" || g === "AAAA") return "#ffe082";
  if (g === "SS" || g === "AAA") return "#ffc107";
  if (g === "S" || g === "AA") return "#d4a017";
  if (g === "A") return "#66bb6a";
  if (g === "B") return "#42a5f5";
  if (g === "C") return "#ffa726";
  if (g === "D") return "#ef5350";
  if (g === "F") return "#8d6e63";
  return "#9e9e9e";
}

export function gradeTextGradientStyle(grade: string): Record<string, string> {
  const c = gradePrimaryColor(grade);
  return {
    background: `linear-gradient(135deg, ${c}, ${c}cc)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };
}
