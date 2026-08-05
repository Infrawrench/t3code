import { useEffect, useState } from "react";
import {
  DEFAULT_THREAD_AUTO_SETTLE_AFTER_DAYS,
  MAX_THREAD_AUTO_SETTLE_AFTER_DAYS,
  MIN_THREAD_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts";

import {
  usePrimarySettings,
  useSidebarV2Enabled,
  useUpdatePrimarySettings,
} from "../../hooks/useSettings";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  // Local draft so the field can be emptied mid-edit; the setting only moves
  // on valid input and snaps back to the persisted value on blur.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={MIN_THREAD_AUTO_SETTLE_AFTER_DAYS}
      max={MAX_THREAD_AUTO_SETTLE_AFTER_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // Number(), not parseInt: "3.5" must be rejected (not truncated to a
        // committed 3 while the field shows 3.5) — commit only when the
        // persisted value matches the displayed one.
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= MIN_THREAD_AUTO_SETTLE_AFTER_DAYS &&
          parsed <= MAX_THREAD_AUTO_SETTLE_AFTER_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label="Days of inactivity before auto-settle"
    />
  );
}

export function BetaSettingsPanel() {
  const sidebarV2Enabled = useSidebarV2Enabled();
  const threadAutoSettleAfterDays = usePrimarySettings(
    (settings) => settings.threadAutoSettleAfterDays,
  );
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Beta features">
        <SettingsRow
          {...searchableSetting("sidebar-v2")}
          description="One flat thread list in creation order. Active work renders as rich cards; settled threads collapse to compact rows. Settling requires an up-to-date server — on older servers threads simply stay active. Switch back any time."
          control={
            <Switch
              checked={sidebarV2Enabled}
              // Touching the switch pins the choice, so a nightly build that
              // defaults v2 on does not flip it back after the user opts out.
              onCheckedChange={(checked) =>
                updateSettings({
                  sidebarV2Enabled: Boolean(checked),
                  sidebarV2ConfiguredByUser: true,
                })
              }
              aria-label="Enable the sidebar v2 beta"
            />
          }
        />
        {sidebarV2Enabled ? (
          <>
            <SettingsRow
              title={searchableSetting("auto-settle-inactive-threads").title}
              description="Threads with no activity for this long settle automatically. Merged PRs always settle."
              control={
                <Switch
                  checked={threadAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      threadAutoSettleAfterDays: checked
                        ? DEFAULT_THREAD_AUTO_SETTLE_AFTER_DAYS
                        : null,
                    })
                  }
                  aria-label="Auto-settle inactive threads"
                />
              }
            />
            {threadAutoSettleAfterDays !== null ? (
              <SettingsRow
                title="Days of inactivity before auto-settle"
                description="Any new activity un-settles a thread automatically."
                control={
                  <AutoSettleDaysInput
                    value={threadAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ threadAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
          </>
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
