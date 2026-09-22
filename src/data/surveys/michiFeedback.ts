/**
 * MICHI-MAKER'S FEEDBACK SURVEY. This file, plus the `app` id at the top of it, is the ONLY
 * app-specific part of the whole feedback system: the types, the logic, the renderer and the
 * table are shared, and a sibling app ships its own copy of this file and nothing else.
 *
 * WHY THESE QUESTIONS, in the order they are asked:
 *
 *   1. The anchor first, not last. One number tracked over time, asked where abandonment is
 *      lowest, with the reason-why follow-up that is the only part of a recommendation score
 *      anybody can act on.
 *   2. Aspect ratings, five of them. Five is the most a person will rate honestly; the sixth row
 *      is where people start answering "fine" to everything. Each one can be skipped, because a
 *      rating of a feature someone has never opened is noise that looks like data.
 *   3. Two usability items. The short validated pair rather than a ten-item battery: it tracks
 *      the long form closely enough for a product survey and costs eight fewer questions.
 *   4. One effort question, about the moment that decides whether somebody stays.
 *   5. The open questions. One asks for a priority ("the one thing"), which is what makes an
 *      open box worth reading; one asks for a bug, which is a different thing and gets confused
 *      with the first unless they are asked separately.
 *   6. Games, then pipeline. The two "what should we build" questions, at the point where
 *      somebody who is still here is invested enough to think about it.
 *   7. Who they are, then how to reach them. Last, always.
 *
 * ON THE WORDING: every scale names both ends, the aspect points are words rather than bare
 * numbers (a matrix draws no end labels, so digits alone would leave the direction undefined),
 * the games list is alphabetical so position is not an argument, and the detractor follow-up asks
 * what is holding it back rather than what went wrong, because the branch covers 6s as well as 0s.
 *
 * COPY RULES IN FORCE: no em-dashes. Never mention how a binder gets made or how cards are
 * organised behind the scenes. The sister app is not named anywhere while SHOW_CROSS_APP is off.
 * Nothing here promises a feature: "would you use" is a question, and the page says so.
 */
import type { SurveyDef } from '@/data/survey/surveyTypes';

/** The value written to `feedback_responses.app`. One const, the whole tenancy scheme. */
export const FEEDBACK_APP = 'michi';

/**
 * Five points, NAMED rather than numbered. A matrix draws no end labels (each row stacks under
 * its own name on a phone, and a single header row would scroll away), so a bare 1 to 5 leaves
 * nothing on screen saying which end is the good one. Words carry their own direction.
 */
const FIVE_POINT = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Weak' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

export const MICHI_FEEDBACK: SurveyDef = {
  app: FEEDBACK_APP,
  id: 'product-feedback',
  version: 1,
  title: 'Tell us what to fix, and what to build next',
  lede:
    'Every question is optional, so this takes as long as you want it to: about a minute if you '
    + 'answer the first one and leave, four or five if you fill the lot in. You do not need an '
    + 'account.',
  submitLabel: 'Send feedback',
  thanks: {
    title: 'Thank you. This gets read.',
    body:
      'Every response is read by the person who builds michi-maker. If you left an address and '
      + 'ticked the box, you may get a reply; either way the answers go straight into what gets '
      + 'worked on next.',
  },
  sections: [
    // ---------------------------------------------------------------- anchor
    {
      id: 'overall',
      questions: [
        {
          kind: 'scale',
          id: 'nps',
          prompt: 'How likely are you to recommend michi-maker to another collector?',
          min: 0,
          max: 10,
          minLabel: 'Not at all likely',
          maxLabel: 'Extremely likely',
          anchor: true,
        },
        {
          kind: 'text',
          id: 'nps_why_low',
          // NOT "what went wrong": this branch covers 0 through 6, and a 6 is somebody who is
          // unconvinced rather than somebody who had a disaster. A prompt that presupposes a
          // disaster gets abandoned by the people in the middle, who are the ones worth hearing.
          prompt: 'What is holding it back?',
          help: 'The specific thing, if there is one. It is more useful than a polite summary.',
          lines: 3,
          maxLength: 1000,
          placeholder: 'What is not working for you',
          showWhen: { id: 'nps', in: [0, 1, 2, 3, 4, 5, 6] },
        },
        {
          kind: 'text',
          id: 'nps_why_mid',
          prompt: 'What would make it a 9 or a 10?',
          lines: 3,
          maxLength: 1000,
          placeholder: 'The thing that is missing',
          showWhen: { id: 'nps', in: [7, 8] },
        },
        {
          kind: 'text',
          id: 'nps_why_high',
          prompt: 'What do you like most about it?',
          lines: 3,
          maxLength: 1000,
          placeholder: 'The part you would tell someone else about',
          showWhen: { id: 'nps', in: [9, 10] },
        },
      ],
    },
    // --------------------------------------------------------------- ratings
    {
      id: 'ratings',
      title: 'How are we doing',
      blurb: 'Skip any you have not used. A guess is worse than a blank.',
      questions: [
        {
          kind: 'matrix',
          id: 'aspect',
          prompt: 'Rate each part of michi-maker',
          rows: [
            { id: 'ease', label: 'Ease of use' },
            { id: 'building', label: 'Building and editing a binder' },
            { id: 'finding', label: 'Finding the cards you want' },
            { id: 'sharing', label: 'Sharing and printing' },
            { id: 'value', label: 'Value for money' },
          ],
          points: FIVE_POINT,
          skipLabel: 'Not used',
        },
        {
          kind: 'scale',
          id: 'umux_needs',
          prompt: 'michi-maker does what I need it to do.',
          min: 1,
          max: 5,
          minLabel: 'Strongly disagree',
          maxLabel: 'Strongly agree',
        },
        {
          kind: 'scale',
          id: 'umux_easy',
          prompt: 'michi-maker is easy to use.',
          min: 1,
          max: 5,
          minLabel: 'Strongly disagree',
          maxLabel: 'Strongly agree',
        },
        {
          kind: 'scale',
          id: 'effort_first_binder',
          prompt: 'How easy was it to get your first binder looking the way you wanted?',
          min: 1,
          max: 5,
          minLabel: 'Very difficult',
          maxLabel: 'Very easy',
          skipLabel: 'Not built one yet',
        },
      ],
    },
    // ------------------------------------------------------------------ open
    {
      id: 'open',
      title: 'In your words',
      questions: [
        {
          kind: 'text',
          id: 'one_thing',
          prompt: 'If you could change one thing, what would it be?',
          help: 'One thing, not a list. Which one you pick is the useful part.',
          lines: 4,
          maxLength: 1500,
          placeholder: 'The one change that would matter most to you',
        },
        {
          kind: 'text',
          id: 'broken',
          prompt: 'Did anything not work, or look wrong?',
          help: 'What you were doing and what happened. The page it was on helps.',
          lines: 4,
          maxLength: 1500,
          placeholder: 'What broke, and where',
        },
      ],
    },
    // ----------------------------------------------------------------- games
    {
      id: 'games',
      title: 'Card games',
      blurb: 'Pokemon, One Piece and Disney Lorcana are in michi-maker today. This is about what comes after.',
      questions: [
        {
          kind: 'choice',
          id: 'games_wanted',
          // "Card games" would make the sports-cards option a category error. "Cards" covers both.
          prompt: 'Which cards would you like michi-maker to support?',
          help: 'Pick as many as you would actually build a binder from.',
          // ALPHABETICAL BY LABEL, with "Something else" pinned last. Not an aesthetic choice:
          // the first options in a check-all-that-apply list get picked more often whatever they
          // say, so any hand-ordering is a thumb on the scale. Alphabetical is the one order
          // nobody can argue is a hint, and it keeps the two games with data already staged from
          // sitting where they would look like the expected answer.
          options: [
            { id: 'vanguard', label: 'Cardfight Vanguard' },
            { id: 'digimon', label: 'Digimon' },
            { id: 'dragonball', label: 'Dragon Ball Super' },
            { id: 'fleshandblood', label: 'Flesh and Blood' },
            { id: 'gundam', label: 'Gundam' },
            { id: 'magic', label: 'Magic: The Gathering' },
            { id: 'riftbound', label: 'Riftbound' },
            { id: 'sports', label: 'Sports cards' },
            { id: 'starwars', label: 'Star Wars Unlimited' },
            { id: 'weiss', label: 'Weiss Schwarz' },
            { id: 'yugioh', label: 'Yu-Gi-Oh!' },
            { id: 'other', label: 'Something else' },
          ],
          otherOptionId: 'other',
        },
        {
          // Forcing ONE pick out of what they already chose is what separates a wish list from a
          // priority. It is the cheap version of asking people to trade options off against each
          // other, and it costs one tap.
          kind: 'choice',
          id: 'games_first',
          prompt: 'Of those, which one should come first?',
          // `optionsFrom` both fills the chips and hides the question until at least two games
          // are picked, so there is no showWhen list here to fall out of step with the options.
          optionsFrom: 'games_wanted',
          options: [],
          max: 1,
        },
      ],
    },
    // -------------------------------------------------------------- pipeline
    {
      id: 'pipeline',
      title: 'Things we are considering',
      blurb: 'None of these is promised. We are asking which ones are worth the time.',
      questions: [
        {
          kind: 'matrix',
          id: 'want',
          prompt: 'Which of these would you use?',
          rows: [
            { id: 'phone_app', label: 'A michi-maker app for iPhone and Android' },
            { id: 'camera_roll', label: 'Add your own art straight from your phone' },
            { id: 'templates', label: 'Ready-made binder templates, like a full set or a rainbow by price' },
            { id: 'collection', label: 'Manage your card collection inside michi-maker' },
            { id: 'auto_theme', label: 'Ask michi-maker to plan a whole binder around a theme you pick' },
            { id: 'physical', label: 'Order your binder printed and posted to you' },
          ],
          points: [
            { value: 1, label: 'Not for me' },
            { value: 2, label: 'Nice to have' },
            { value: 3, label: 'I want this' },
          ],
        },
        {
          kind: 'text',
          id: 'want_other',
          prompt: 'Anything else you wish it did?',
          lines: 3,
          maxLength: 1000,
          placeholder: 'The feature you keep looking for and not finding',
        },
      ],
    },
    // ---------------------------------------------------------------- who/how
    {
      id: 'about',
      title: 'About you',
      blurb: 'Optional, and it only exists so we can tell whose answers are whose.',
      questions: [
        {
          kind: 'choice',
          id: 'tenure',
          prompt: 'How long have you been using michi-maker?',
          max: 1,
          options: [
            { id: 'today', label: 'First time today' },
            { id: 'weeks', label: 'A few weeks' },
            { id: 'months', label: 'A few months' },
            { id: 'start', label: 'Since early on' },
          ],
        },
        {
          kind: 'choice',
          id: 'frequency',
          prompt: 'How often do you use it?',
          max: 1,
          options: [
            { id: 'daily', label: 'Most days' },
            { id: 'weekly', label: 'Most weeks' },
            { id: 'sometimes', label: 'Now and then' },
            { id: 'once', label: 'This is my first visit' },
          ],
        },
        {
          kind: 'choice',
          id: 'purpose',
          // The control is an unlimited multi-select, so the prompt must not say "mainly". A
          // prompt that asks for one while the control takes several produces answers nobody can
          // interpret: a single tick might mean "only this" or "this first".
          prompt: 'What do you use it for? Pick as many as apply.',
          options: [
            { id: 'plan_real', label: 'Planning a binder I will build for real' },
            { id: 'digital', label: 'A collection that only exists online' },
            { id: 'show', label: 'Showing people what I have' },
            { id: 'print', label: 'Printing art and dividers' },
            { id: 'play', label: 'Just enjoying the tool' },
          ],
        },
      ],
    },
    {
      id: 'contact',
      title: 'If you want a reply',
      questions: [
        {
          kind: 'email',
          id: 'email',
          prompt: 'Your email',
          help: 'Only used to reply to this. It is not added to any mailing list.',
        },
        {
          kind: 'consent',
          id: 'contact_ok',
          prompt: 'You can email me about this feedback.',
        },
      ],
    },
  ],
};
