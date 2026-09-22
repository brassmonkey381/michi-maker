/**
 * THE RENDERER. Give it a survey definition and it draws the whole thing: sections, questions,
 * progressive follow-ups, the count of what has been answered, and the submit button. It knows
 * no app, no product and no question, which is the point.
 *
 * WHAT THIS COMPONENT OWNS: the answer map, and nothing else. It does not submit, does not know
 * about Supabase, and does not decide what a thank-you says. The route hands it a definition and
 * an `onSubmit` and gets answers back, so the same component serves a page, a modal, or an
 * in-product prompt without changing.
 *
 * THE DRAFT IS KEPT. A survey that loses ten minutes of typing to a stray refresh is a survey
 * that never gets filled in twice. It is per-browser, local only, and it is cleared the moment
 * the thing is sent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  ConsentRow,
  MatrixRow,
  QuestionHead,
  ScaleRow,
  SurveyTextInput,
} from '@/components/survey/SurveyControls';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  answeredCount,
  canSubmit,
  derivedOptions,
  isVisible,
  looksLikeEmail,
  toggleChoice,
  visibleQuestions,
} from '@/data/survey/surveyState';
import {
  type AnswerMap,
  type SurveyAnswer,
  type SurveyDef,
  type SurveyQuestion,
  otherKey,
  rowKey,
} from '@/data/survey/surveyTypes';

/** The sentinel a skip stores. A real value, so "skipped" is a thing somebody SAID. */
const SKIPPED = 'skipped';

/**
 * An unsent draft, if this browser kept one. Storage throws in private mode and with site data
 * blocked, and a survey that crashes on open is worse than one that forgets what you typed.
 */
function readDraft(draftKey?: string): AnswerMap {
  if (!draftKey) return {};
  try {
    const raw = globalThis.localStorage?.getItem(draftKey);
    if (!raw) return {};
    const saved = JSON.parse(raw) as AnswerMap;
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function SurveyForm({
  def,
  prefill,
  submitting,
  error,
  onSubmit,
  draftKey,
}: {
  def: SurveyDef;
  /** Answers known before a question is asked, e.g. the account's own address. */
  prefill?: AnswerMap;
  submitting: boolean;
  error: string | null;
  onSubmit: (answers: AnswerMap) => void;
  /** Where the unsent draft lives on this device. Omit to keep nothing. */
  draftKey?: string;
}) {
  // The draft is read ONCE, as this component is created. Doing it in an effect would mean a
  // first render with an empty form and a second with the text in it, which is a visible flash
  // and a cascading render the compiler rightly objects to.
  const [answers, setAnswers] = useState<AnswerMap>(() => readDraft(draftKey));

  // `prefill` can arrive after mount (the account's address loads asynchronously), so it is NOT
  // merged into state. It sits underneath: a field shows the typed answer if there is one and
  // the prefilled value otherwise, and the two are merged again at submit. That way a late
  // arrival still fills the box, and clearing the box stays cleared.
  const merged = useMemo<AnswerMap>(() => ({ ...prefill, ...answers }), [prefill, answers]);

  // Writing the draft out IS an external system, which is what an effect is for.
  useEffect(() => {
    if (!draftKey) return;
    try {
      // An emptied form is a draft too. Without the removal, un-picking the last answer leaves
      // the old draft on disk and a refresh brings back what the person just cleared.
      if (Object.keys(answers).length) globalThis.localStorage?.setItem(draftKey, JSON.stringify(answers));
      else globalThis.localStorage?.removeItem(draftKey);
    } catch {
      /* nothing to do: the draft is a convenience, not a feature */
    }
  }, [answers, draftKey]);

  const set = useCallback((id: string, value: SurveyAnswer | undefined) => {
    setAnswers((prev) => {
      if (value === undefined) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: value };
    });
  }, []);

  const answered = answeredCount(def, merged);
  const total = visibleQuestions(def, merged).length;
  const ready = canSubmit(def, merged);
  const emailQ = useMemo(() => def.sections.flatMap((s) => s.questions).find((q) => q.kind === 'email'), [def]);
  const emailValue = emailQ ? merged[emailQ.id] : undefined;
  // Only complain about an address once it is long enough to be a real attempt.
  const emailBad =
    typeof emailValue === 'string' && emailValue.trim().length > 5 && !looksLikeEmail(emailValue);

  const submit = () => {
    if (!ready || submitting || emailBad) return;
    onSubmit(merged);
  };

  return (
    <View style={styles.form}>
      {def.sections.map((section) => {
        const shown = section.questions.filter((q) => isVisible(def, q, merged));
        if (!shown.length) return null;
        return (
          <View key={section.id} style={styles.section} testID={`survey-section-${section.id}`}>
            {section.title ? (
              <ThemedText style={styles.sectionTitle}>{section.title.toUpperCase()}</ThemedText>
            ) : null}
            {section.blurb ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionBlurb}>
                {section.blurb}
              </ThemedText>
            ) : null}
            {shown.map((q) => (
              <View key={q.id} style={styles.question} testID={`survey-q-${q.id}`}>
                <Question def={def} q={q} answers={merged} set={set} />
              </View>
            ))}
          </View>
        );
      })}

      {emailBad ? (
        <ThemedText type="small" style={styles.warn}>
          That address does not look right. Fix it, or clear it to send without one.
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={styles.warn} testID="survey-error">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.submitRow}>
        <Pressable
          onPress={submit}
          disabled={!ready || submitting || emailBad}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || submitting || emailBad, busy: submitting }}
          accessibilityLabel={def.submitLabel}
          testID="survey-submit"
          style={({ pressed }) => [
            styles.submit,
            (!ready || emailBad) && styles.submitOff,
            pressed && styles.pressed,
          ]}>
          {submitting ? <ActivityIndicator size="small" color={Palette.accentText} /> : null}
          <ThemedText style={styles.submitText}>
            {submitting ? 'Sending' : def.submitLabel}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.progress} testID="survey-progress">
          {answered === 0
            ? 'Answer anything to send. Nothing is required.'
            : `${answered} of ${total} answered. Send whenever you like.`}
        </ThemedText>
      </View>
    </View>
  );
}

function Question({
  def,
  q,
  answers,
  set,
}: {
  def: SurveyDef;
  q: SurveyQuestion;
  answers: AnswerMap;
  set: (id: string, value: SurveyAnswer | undefined) => void;
}) {
  const value = answers[q.id];

  if (q.kind === 'scale') {
    const picked = typeof value === 'number' ? value : undefined;
    return (
      <>
        <QuestionHead prompt={q.prompt} help={q.help} />
        <ScaleRow
          min={q.min}
          max={q.max}
          value={picked}
          minLabel={q.minLabel}
          maxLabel={q.maxLabel}
          skipLabel={q.skipLabel}
          skipped={value === SKIPPED}
          // Pressing the chosen number again clears it: a mis-tap must be undoable.
          onPick={(n) => set(q.id, picked === n ? undefined : n)}
          onSkip={() => set(q.id, value === SKIPPED ? undefined : SKIPPED)}
          label={q.prompt}
          testID={`survey-scale-${q.id}`}
        />
      </>
    );
  }

  if (q.kind === 'matrix') {
    return (
      <>
        <QuestionHead prompt={q.prompt} help={q.help} />
        <View style={styles.matrix}>
          {q.rows.map((r) => {
            const key = rowKey(q.id, r.id);
            const rowValue = answers[key];
            const picked = typeof rowValue === 'number' ? rowValue : undefined;
            return (
              <MatrixRow
                key={r.id}
                label={r.label}
                points={q.points}
                value={picked}
                skipLabel={q.skipLabel}
                skipped={rowValue === SKIPPED}
                onPick={(n) => set(key, picked === n ? undefined : n)}
                onSkip={() => set(key, rowValue === SKIPPED ? undefined : SKIPPED)}
                testID={`survey-matrix-${q.id}-${r.id}`}
              />
            );
          })}
        </View>
      </>
    );
  }

  if (q.kind === 'choice') {
    const options = derivedOptions(def, q, answers);
    const max = q.max ?? options.length;
    const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const otherOn = !!q.otherOptionId && selected.includes(q.otherOptionId);
    return (
      <>
        <QuestionHead prompt={q.prompt} help={q.help} />
        <ChoiceChips
          options={options}
          selected={selected}
          single={max === 1}
          label={q.prompt}
          onToggle={(id) => set(q.id, toggleChoice(value, id, max))}
          testID={`survey-choice-${q.id}`}
        />
        {otherOn ? (
          <SurveyTextInput
            value={(answers[otherKey(q.id)] as string) ?? ''}
            onChangeText={(t) => set(otherKey(q.id), t)}
            placeholder="Which one?"
            maxLength={200}
            label={`${q.prompt}: which one`}
            testID={`survey-other-${q.id}`}
          />
        ) : null}
      </>
    );
  }

  if (q.kind === 'text' || q.kind === 'email') {
    return (
      <>
        <QuestionHead prompt={q.prompt} help={q.help} />
        <SurveyTextInput
          value={(value as string) ?? ''}
          onChangeText={(t) => set(q.id, t)}
          placeholder={q.kind === 'text' ? q.placeholder : 'you@example.com'}
          lines={q.kind === 'text' ? q.lines : 1}
          maxLength={q.kind === 'text' ? q.maxLength : 254}
          keyboard={q.kind === 'email' ? 'email-address' : undefined}
          label={q.prompt}
          testID={`survey-text-${q.id}`}
        />
      </>
    );
  }

  return (
    <ConsentRow
      label={q.prompt}
      checked={value === true}
      onToggle={() => set(q.id, value === true ? undefined : true)}
      testID={`survey-consent-${q.id}`}
    />
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.five },
  section: { gap: Spacing.three },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: Weight.semibold,
    letterSpacing: 0.6,
    color: Palette.muted,
  },
  sectionBlurb: { lineHeight: 18, marginTop: -Spacing.two },
  question: { gap: Spacing.two },
  matrix: { gap: Spacing.two },
  warn: { color: Palette.danger, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  submitRow: { gap: Spacing.two, alignItems: 'flex-start' },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 11,
    paddingHorizontal: Spacing.four,
  },
  // Disabled, not hidden: the button has to be visible from the top of the page so the length of
  // the thing is obvious before anybody starts.
  submitOff: { opacity: 0.45 },
  submitText: { color: Palette.accentText, fontWeight: Weight.semibold, fontSize: FontSize.control },
  progress: { lineHeight: 18 },
});
