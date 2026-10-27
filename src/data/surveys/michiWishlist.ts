/**
 * THE FREE-TEXT HALF OF THE WHAT-NEXT PAGE (/wishlist). The clicks go to feature_votes; the
 * words come here, through the same survey pipeline and table as Leave Feedback, so the person
 * reading feedback reads wishes in the same place. One box, an address, one opt-in.
 *
 * Copy rules: no em-dashes, nothing about how a binder is made behind the scenes, no promises.
 */
import type { SurveyDef } from '@/data/survey/surveyTypes';

import { FEEDBACK_APP } from './michiFeedback';

export const MICHI_WISHLIST: SurveyDef = {
  app: FEEDBACK_APP,
  id: 'wishlist',
  version: 1,
  title: 'What should we build next?',
  lede:
    'Tap every idea you would use; tap again to take a vote back. The counts are everyone’s. '
    + 'Anything not on the list goes in the box below. You do not need an account.',
  submitLabel: 'Send my idea',
  thanks: {
    title: 'Thank you. It goes on the list.',
    body:
      'Every idea is read by the person who builds michi-maker, next to the votes above. '
      + 'If you left an address and ticked the box, you may hear back when it ships.',
  },
  sections: [
    {
      id: 'idea',
      questions: [
        {
          kind: 'text',
          id: 'idea',
          prompt: 'Something else you want',
          help: 'What you would do with it is more useful than a feature name.',
          lines: 4,
          maxLength: 2000,
          placeholder: 'The thing you keep wishing the app did',
        },
      ],
    },
    {
      id: 'contact',
      questions: [
        {
          kind: 'email',
          id: 'email',
          prompt: 'Your email, if we may reply',
        },
        {
          kind: 'consent',
          id: 'contact_ok',
          prompt: 'You may email me about this idea.',
        },
      ],
    },
  ],
};
