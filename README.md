# Interval Timer

A phone-friendly interval timer for workouts (e.g. 20 minutes of 40 s on / 20 s off).

- Set **total time**, **work** seconds and **rest** seconds.
- List your **lifts** (one per line). Each work interval shows its lift; each rest shows what's **up next**. Lifts repeat as a circuit if there are fewer lifts than rounds.
- **5 second lead-in** with a countdown beep before the first interval (so 20:00 runs 20:05).
- **Countdown beeps** on the last 5 seconds of every work and rest interval, plus a tone at each change and a finish chime.
- **Plays over your music**: beeps use Web Audio with an "ambient" audio session, so Spotify keeps playing instead of pausing.
- **Screen stays on** while the timer runs. Uses the Screen Wake Lock API where available; otherwise (e.g. DuckDuckGo and other Android WebView browsers) it loops a tiny silent video, which has no audio track so it can't interrupt your music.
- **Saved workouts**: name and save setups, then load, update or delete them. They're kept in the browser on that device, with **Export backup / Import** to a JSON file.
- **Kettlebell presets**: four 20-minute workouts (Full Body, Lower Body, Upper Body & Core, Swing Conditioning), each in two levels: *Level 1* 30 s on / 30 s off with simpler moves, *Level 2* 40 s on / 20 s off with harder moves.
- **Movement guides**: a looping stick-figure animation and a short form cue for each move. Work shows the current move; rest and the lead-in show the one coming up. Custom lift names are matched where possible (e.g. "KB swings", "Turkish get-up"); unknown moves just show the name. The round preview on the setup screen lists the cues too.
- **Stop → Reset**: Stop freezes the timer and the button turns into Reset. Resume carries on; Reset goes back to setup. (No pop-up dialogs, since some Android browsers block them.)
- Works offline once loaded, and can be added to the home screen.

## Using it

It's a static site with no build step. Wake lock needs HTTPS, so host it somewhere like GitHub Pages:

1. Repo **Settings → Pages** → Source: *Deploy from a branch*, choose the branch and `/ (root)`.
2. Open `https://<user>.github.io/workout_timer/` on your phone.
3. Use **Share → Add to Home Screen** (iOS) or **Install app** (Android) for a full-screen app.

To run locally: `python3 -m http.server` in this folder and open http://localhost:8000.

## Notes

- **iPhone**: needs iOS 16.4+ for wake lock and audio mixing. The ringer/silent switch must be off silent to hear beeps. Keep the timer app in the foreground (control music from Control Center).
- **Android (Chrome)**: Web Audio doesn't take audio focus, so music keeps playing.
- **Android (DuckDuckGo)**: works the same way. If you use the Fire button or *Automatically clear data*, **Fireproof** the timer site (menu → *Fireproof this site*) so saved workouts aren't wiped, and keep an exported backup. DuckDuckGo's *Add to Home Screen* makes a shortcut rather than a full-screen app.
- Saved workouts live in that browser's local storage. They don't sync between devices, and clearing site data removes them.
