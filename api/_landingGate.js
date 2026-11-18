/**
 * THE FRONT DOOR'S ONE DECISION (MIC-037). `/` is two different pages:
 *
 *   dist/home.html  the static landing (public/landing-v2/index.html plus this gate), for a first
 *                   visit and for every crawler: real HTML, no app bundle, same bytes for everyone.
 *   dist/app.html   the app, for anyone who has been in before.
 *
 * vercel.json picks between them on ONE cookie, `mm_app` (never on the user agent, so a crawler and
 * a new visitor always get the same page). The cookie is set by the app once a visitor is in it
 * (lib/landing.ts markAppCookie), by the landing's own "Start a binder" links, and by this gate.
 *
 * The gate runs first thing in home.html's <head>, before anything paints, and repeats the app's
 * own rules (src/lib/landing.ts shouldShowLanding / landingSkipTarget, TRI-007):
 *   - an auth return (?code=<not a campaign code>, ?error, token_hash, type, #access_token, #error,
 *     #type, the BiBo #th ticket) is never a first visit;
 *   - a Reddit ad arrival skips the landing (the app sends it on to the wizard or seeded binder);
 *   - the seen flag, or a stored non-anonymous Supabase session, means "been in before";
 *   - storage that cannot be read never traps anyone on the landing.
 * Any of those: set the cookie and reload the same URL (hash included), which the server now answers
 * with the app. If the cookie will not stick (cookies blocked) or the reload already happened once in
 * this tab, it goes to /my-binders instead, which is always the app, so it can never loop.
 *
 * `michiLandingGate` is serialized into the page with Function.prototype.toString, so it is written
 * in plain ES5 with no references outside its argument. The tests call it with a fake window.
 */
function michiLandingGate(w) {
  var l = w.location, d = w.document, app = false, s = '', h = '';
  try {
    s = l.search || '';
    h = l.hash || '';
    var q = new w.URLSearchParams(s);
    var code = q.get('code');
    if (code && !/^[a-z0-9_]{1,64}$/i.test(code)) app = true;
    if (/[?&](error|error_description|error_code|token_hash|type)=/.test(s)) app = true;
    if (/[#&](access_token|refresh_token|error|error_description|th|type)=/.test(h)) app = true;
    if (String(q.get('utm_source') || '').toLowerCase() === 'reddit') app = true;
    if (!app) {
      var ls = null;
      try {
        ls = w.localStorage;
        if (ls.getItem('michi.landing.seen')) app = true;
      } catch (e) {
        app = true;
      }
      if (!app) {
        try {
          for (var i = 0; i < ls.length && !app; i += 1) {
            var k = ls.key(i);
            if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
            var v = JSON.parse(ls.getItem(k) || 'null');
            if (v && v.user && v.user.is_anonymous === false) app = true;
          }
        } catch (e) {
          /* unreadable session: the seen flag already said no */
        }
      }
    }
  } catch (e) {
    return 'landing';
  }
  if (!app) return 'landing';
  try {
    d.documentElement.style.visibility = 'hidden';
    w.setTimeout(function () { d.documentElement.style.visibility = ''; }, 4000);
  } catch (e) {
    /* cosmetic only */
  }
  var again = false;
  try {
    var last = Number(w.sessionStorage.getItem('mm_gate') || 0);
    again = last > 0 && Date.now() - last < 15000;
    w.sessionStorage.setItem('mm_gate', String(Date.now()));
  } catch (e) {
    again = true;
  }
  try {
    d.cookie = 'mm_app=1; Path=/; Max-Age=31536000; SameSite=Lax' + (l.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {
    /* checked below */
  }
  var stuck = !/(^|;\s*)mm_app=1/.test(String(d.cookie || ''));
  if (stuck || again) {
    l.replace('/my-binders' + s + h);
    return 'fallback';
  }
  l.reload();
  return 'reload';
}

/** The <script> that goes first in home.html's <head>. */
function gateScript() {
  return '<script>/* MIC-037 front door: api/_landingGate.js */(' + michiLandingGate.toString() + ')(window);</script>';
}

module.exports = { michiLandingGate, gateScript };
