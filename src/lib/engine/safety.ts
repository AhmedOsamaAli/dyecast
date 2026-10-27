import type { HairProfileInput, Prediction } from "./types";

export interface SafetyItem {
  id: string;
  level: "must" | "should" | "info";
  title: string;
  detail: string;
}

/**
 * Practical safety checklist shown before anyone dyes. Not medical advice.
 * Sources: FDA hair dye safety checklist, NHS "Hair dye reactions" and "Using hair dye in pregnancy",
 * EU Cosmetics Regulation 1223/2009 Annex III label warnings.
 */
export function safetyChecklist(profile: HairProfileInput, prediction?: Prediction): SafetyItem[] {
  const items: SafetyItem[] = [
    {
      id: "patch-test",
      level: "must",
      title: "Do the box's allergy alert test every time",
      detail:
        "Most oxidative dyes ask for a skin test 48 hours before use — follow your product's exact instructions, even if you've used it before, because sensitivity can build up. A clear test doesn't guarantee you won't react. If you've ever reacted to hair dye or a temporary 'black henna' tattoo, don't use it; ask a pharmacist or doctor about alternatives.",
    },
    {
      id: "warning-signs",
      level: "must",
      title: "Know the warning signs",
      detail:
        "Stinging, burning, an itchy rash or blisters can appear up to 72 hours later: wash hair and scalp with mild shampoo and see a pharmacist or doctor if it gets worse. Call emergency services if your lips, mouth, tongue or throat swell or you struggle to breathe.",
    },
  ];

  const lightening = prediction ? prediction.roots.lift > 0 || prediction.lengths.lift > 0 : false;
  const risky = lightening || profile.history !== "virgin" || profile.ends !== "healthy";
  items.push({
    id: "strand-test",
    level: "should",
    title: "Strand test a hidden section 48 hours before",
    detail: `The NHS advises testing the dye on a strand at least 48 hours before you use it.${risky ? " With your hair's history or lift, it's also the only true preview of the color." : " It also shows the real color on your hair."}`,
  });

  if (profile.history === "henna") {
    items.push({
      id: "henna",
      level: "must",
      title: "Get professional advice before coloring over henna",
      detail: "Some compound henna products contain metallic salts that can react with developer. Do not rely on this preview or a home test to establish chemical compatibility.",
    });
  }

  if (profile.ends === "damaged") {
    items.push({
      id: "damaged-ends",
      level: "should",
      title: "Treat or trim very damaged ends first",
      detail: "Damaged ends absorb dye unevenly and break more easily after chemical processing.",
    });
  }

  items.push(
    {
      id: "chemical-wait",
      level: "should",
      title: "Wait at least 14 days after bleaching, relaxing or perming",
      detail: "That's the FDA's minimum before using dye; colorists often suggest longer after relaxers or keratin treatments. Don't scratch or brush your scalp for 3 days before, and don't dye an irritated, sunburned or broken scalp.",
    },
    {
      id: "pregnancy",
      level: "info",
      title: "Pregnant?",
      detail: "The NHS says most research shows dyeing is safe, though you might wait until after the first 12 weeks. Hair can react differently in pregnancy, so always strand test, wear gloves, ventilate the room and use the minimum time.",
    },
    {
      id: "brows",
      level: "info",
      title: "Never use hair dye on eyebrows or eyelashes",
      detail: "Hair dye near the eyes can cause serious injury, including blindness.",
    },
  );
  return items;
}
