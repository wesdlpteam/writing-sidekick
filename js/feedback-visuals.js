// Writing craft and editing are separate: error totals do not lower craft ratings.
export function writingStrength(criteria = []) {
  const areas = criteria.filter((area) => !["spelling", "punctuation"].includes(area.key)
    && ["strength", "steady", "next_step"].includes(area.status));
  return {
    areas,
    strong: areas.filter((area) => area.status === "strength").length,
    keyStrength: areas.find((area) => area.status === "strength")?.label || "Keep building your writing skills",
    focus: areas.find((area) => area.powerUp === 1)?.label
      || areas.find((area) => area.status === "next_step")?.label || "Keep stretching your skills",
  };
}
