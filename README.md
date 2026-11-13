# Doomsgiving

A phone-friendly interval timer, themed as an autumn harvest in a land of ash and fire, for workouts (e.g. 20 minutes of 40 s on / 20 s off).

- Set **total time**, **work** seconds and **rest** seconds.
- Add your **lifts** one box at a time (**+ Add lift** / **−** to remove; Enter jumps to a new box). Each work interval shows its lift; each rest shows what's **up next**. Lifts repeat as a circuit if there are fewer lifts than rounds.
- **5 second lead-in** with a countdown beep before the first interval (so 20:00 runs 20:05).
- **Countdown beeps** on the last 5 seconds of every work and rest interval, plus a tone at each change and a finish chime.
- **Plays over your music**: beeps use Web Audio with an "ambient" audio session, so Spotify keeps playing instead of pausing.
- **Screen stays on** while the timer runs. Uses the Screen Wake Lock API where available; otherwise (e.g. DuckDuckGo and other Android WebView browsers) it loops a tiny silent video, which has no audio track so it can't interrupt your music.
- **Saved workouts**: name and save setups, then load, update or delete them. They're kept in the browser on that device, with **Export backup / Import** to a JSON file.
- **Interval presets** (20 min, 40 s on / 20 s off): Forge of the Ember Tyrant, Tremor Golem, Obsidian Pauldrons, Pendulum of the Void, and Scroll of the Ashen Pilgrim (Level 1 and 2).
- **AMRAP mode**: switch Timing to *AMRAP*, set the total time and add each exercise with its reps in its own row (Push-up 5, Overhead press 8, Burpee 10). The run screen shows a big countdown with the whole list underneath, plus a **+1 round** counter. Same 5 s lead-in, last-5-second beeps and finish chime. Two kettlebell AMRAP presets (Level 1 and Level 2, 20 min) are included.
- **Intervals / AMRAP filter**: the workout list only shows workouts of the selected type (presets and your own).
- **Level 1 / Level 2 toggle**: filters the built-in workouts to that level. Switching level while a two-level workout (Scroll of the Ashen Pilgrim, Warp Core Breach) is open loads its other version. Your own saved workouts always show.
- **AMRAP presets** (20 min): Warp Core Breach (Level 1 and 2), plus Level 2 Gravy Leviathan, March of the Oakshank, Spine of the Cinder Wyrm, Cyber-Turkey Uprising and Lava Gourd Ritual.
- **Scroll of the Ashen Pilgrim** presets (from a handwritten workout card) (40 s on / 20 s off, 20 min). *Level 1*: Swings, Squat to press, Plank row, Deadlift, Reverse lunge & curl. *Level 2*: Two-handed swing, Goblet squat, Single-arm row, Clean and press, Reverse lunge.
- **Custom cues**: add your own coaching cue to any interval lift after a colon (`Goblet squat: chest up, sit deep`). It replaces the built-in description.
- **Finish quote**: the finish screen shows a real Stephen Hawking quote and speaks it (after "Workout complete.") in the DECtalk "Perfect Paul" voice. The clips in `quotes/` were rendered with the DECtalk engine from the [text-to-voice](https://github.com/dbarger-meng/text-to-voice) project. They play through Web Audio so they mix over music. While it plays, the app asks the phone to dim other apps' music (iPhone: a transient audio session; Android: a short near-silent clip that Chrome-based browsers treat as a transient sound). The voice is compressed and boosted to cut through. Turn either off under **Sound**.
- **Movement guides**: a looping animation of an original armored warrior (crested helm, cape, glowing ember kettlebell) doing each move while knocking back an ash gremlin on every rep and a short form cue for each move. Work shows the current move; rest and the lead-in show the one coming up. Custom lift names are matched where possible (e.g. "KB swings", "Turkish get-up"); unknown moves just show the name. The round preview on the setup screen lists the cues too.
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
