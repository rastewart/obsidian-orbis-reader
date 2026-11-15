// Orbis ships no hotkeys of its own.
//
// A default hotkey takes a key combination from every reader who installs the plugin, and can shadow one they or
// another plugin already use. Commands are bound by the reader, in Settings → Hotkeys. A device run cannot check
// this — a vault holds whatever its reader bound — so it is checked here, where the commands are declared.

import type { Command } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { registerCommands } from '../commands';
import type OrbisReaderPlugin from '../main';

/** Every command `registerCommands` adds. Anything else it touches on the plugin is answered with a harmless stub. */
function registeredCommands(): Command[] {
  const commands: Command[] = [];
  const stub: () => unknown = () => stubProxy;
  const stubProxy: unknown = new Proxy(stub, { get: () => stubProxy, apply: () => stubProxy });
  const plugin = new Proxy(
    {},
    {
      get: (_target, key) => (key === 'addCommand' ? (command: Command) => commands.push(command) : stubProxy),
    }
  ) as unknown as OrbisReaderPlugin;
  registerCommands(plugin);
  return commands;
}

describe('commands', () => {
  it('registers the plugin’s commands', () => {
    expect(registeredCommands().length).toBeGreaterThan(30);
  });

  it('sets no default hotkey on any of them', () => {
    const bound = registeredCommands()
      .filter((command) => command.hotkeys !== undefined)
      .map((command) => command.id);
    expect(bound).toEqual([]);
  });
});
