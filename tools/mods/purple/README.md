# Purple mod: install in your own Code tab

This adds an always-visible purple band reading "Purple — support" above the
prompt in Claude Code. It is a mod for the Purple (Pro, support) account only.

## Install

1. Get this folder onto your computer. Clone the repo, or download it:
   `git clone https://github.com/imburk/hextable.git`
   The mod is in `tools/mods/purple/`.
2. In your Code tab, ask Claude to install the mod from that folder. The mod
   needs to be in a folder the app can see, such as
   `C:\Users\<you>\.claude\dev-mods\<any-name>\purple-support\`, with
   `.claude-plugin/plugin.json` and `hooks/` inside it.
3. When the app asks "Turn on the mods Claude writes in this session?", choose
   **Turn them on**. The band appears when the turn ends.
4. Confirm you can see "Purple — support" above the prompt.

## Notes

- This mod only changes the band. It does not change rules, tools or prompts.
- To remove it, ask Claude to delete the `purple-support` folder and restart
  the session.
- Do not install the Blue mod on this account. Blue's band is "Blue — lead".
