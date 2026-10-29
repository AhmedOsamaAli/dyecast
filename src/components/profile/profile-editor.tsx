"use client";

import { useActionState, useState } from "react";
import { saveProfile, type ProfileState } from "@/app/profile/actions";
import { LevelPicker, SelectField, TONE_LABELS } from "@/components/form-controls";
import { HairSwatch } from "@/components/hair-swatch";
import { DENSITY_CLASSES, DENSITY_LABELS, LENGTH_CLASSES, LENGTH_LABELS } from "@/lib/engine/boxes";
import { todaySwatch } from "@/lib/engine/swatch";
import { hairProfileSchema, type HairProfileData } from "@/lib/checks/validation";
import { PhotoAssist, type PhotoSuggestions } from "./photo-assist";

const shape = hairProfileSchema.shape;

export function ProfileEditor({ initial, mockMode, storePhotos, next }: {
  initial: HairProfileData;
  mockMode: boolean;
  storePhotos: boolean;
  /** Where to continue after saving (an allow-listed page name). */
  next?: "choose";
}) {
  const [values, setValues] = useState<HairProfileData>(initial);
  const [suggested, setSuggested] = useState<number | undefined>(initial.measurement?.suggestedLevel);
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});

  function update<K extends keyof HairProfileData>(key: K, value: HairProfileData[K]) {
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      if (next.history === "virgin") {
        next.naturalLevel = next.lengthsLevel;
        next.naturalTone = next.currentTone;
      }
      return next;
    });
  }

  function apply(s: PhotoSuggestions) {
    setSuggested(s.level);
    setValues((previous) => {
      const next: HairProfileData = {
        ...previous,
        lengthsLevel: s.level ?? previous.lengthsLevel,
        currentTone: s.tone ?? previous.currentTone,
        length: s.length ?? previous.length,
        density: s.density ?? previous.density,
        gray: s.gray ?? previous.gray,
        measurement: s.measurement,
      };
      if (next.history === "virgin") {
        next.naturalLevel = next.lengthsLevel;
        next.naturalTone = next.currentTone;
      }
      return next;
    });
  }

  return (
    <div className="profile-grid">
      <form action={action} className="panel profile-panel">
        <div className="section-heading">
          <span className="step">01</span>
          <div>
            <h2>Your hair today</h2>
            <p className="muted small">Choose what describes your hair in daylight. Every field is yours to set.</p>
          </div>
        </div>

        <div className="profile-preview">
          <HairSwatch className="mini-swatch" {...todaySwatch(values)} label="Your hair as described" seed={3} />
          <div>
            <strong>{values.history === "virgin" ? "Natural, never colored" : "Colored lengths, natural roots"}</strong>
            <p className="small muted">This swatch updates as you choose. Compare it with your hair near a window.</p>
          </div>
        </div>

        <LevelPicker name="lengthsLevel" label="Current color (lengths)" value={values.lengthsLevel} tone={values.currentTone}
          suggested={suggested} onChange={(v) => update("lengthsLevel", v)} error={state.fields?.lengthsLevel} />
        <div className="form-grid">
          <SelectField name="currentTone" label="Current tone" value={values.currentTone} choices={shape.currentTone.options}
            labels={TONE_LABELS} onChange={(v) => update("currentTone", v)} error={state.fields?.currentTone} />
          <SelectField name="history" label="Color history" value={values.history} choices={shape.history.options}
            labels={{ virgin: "Never colored", dyed: "Previously dyed", highlighted: "Highlighted", bleached: "Bleached / lightened", henna: "Henna / plant dye / unsure" }}
            onChange={(v) => update("history", v)} error={state.fields?.history} />
        </div>
        {values.history !== "virgin" ? (
          <>
            <LevelPicker name="naturalLevel" label="Natural roots" value={values.naturalLevel} tone={values.naturalTone}
              onChange={(v) => update("naturalLevel", v)} error={state.fields?.naturalLevel} />
            <SelectField name="naturalTone" label="Natural root tone" value={values.naturalTone} choices={shape.naturalTone.options}
              labels={TONE_LABELS} onChange={(v) => update("naturalTone", v)} error={state.fields?.naturalTone} />
          </>
        ) : (
          <>
            <input type="hidden" name="naturalLevel" value={values.naturalLevel} />
            <input type="hidden" name="naturalTone" value={values.naturalTone} />
          </>
        )}
        <div className="form-grid">
          <SelectField name="gray" label="Gray share" value={values.gray} choices={shape.gray.options}
            labels={{ none: "None", some: "A little (under 25%)", half: "About 25–50%", most: "More than 50%" }}
            onChange={(v) => update("gray", v)} error={state.fields?.gray} />
          <SelectField name="ends" label="Ends condition" value={values.ends} choices={shape.ends.options}
            labels={{ healthy: "Healthy", dry: "Dry or a bit frizzy", damaged: "Damaged (breaks, stretches)" }}
            onChange={(v) => update("ends", v)} error={state.fields?.ends} />
          <SelectField name="texture" label="Texture" value={values.texture} choices={shape.texture.options}
            onChange={(v) => update("texture", v)} error={state.fields?.texture} />
          <SelectField name="thickness" label="Strand thickness" value={values.thickness} choices={shape.thickness.options}
            labels={{ fine: "Fine (barely feel one strand)", medium: "Medium", coarse: "Coarse (wiry, strong)" }}
            onChange={(v) => update("thickness", v)} error={state.fields?.thickness} />
          <SelectField name="length" label="Length" value={values.length} choices={LENGTH_CLASSES} labels={LENGTH_LABELS}
            onChange={(v) => update("length", v)} error={state.fields?.length} />
          <SelectField name="density" label="Density" value={values.density} choices={DENSITY_CLASSES} labels={DENSITY_LABELS}
            onChange={(v) => update("density", v)} error={state.fields?.density} />
        </div>
        <input type="hidden" name="measurement" value={values.measurement ? JSON.stringify(values.measurement) : ""} />
        {next && <input type="hidden" name="next" value={next} />}
        {state.error && <p role="alert" className="notice danger">{state.error}</p>}
        <button className="button full" disabled={pending}>{pending ? "Saving…" : "Save my hair profile"}</button>
      </form>

      <PhotoAssist mockMode={mockMode} storePhotos={storePhotos} onApply={apply} />
    </div>
  );
}
