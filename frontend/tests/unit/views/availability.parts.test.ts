import { conflictList } from '../../../src/logic/conflicts';
import { availabilityParts, mountConfirm, type Confirmed } from '../../../src/views/availability.parts';
import { find, useRealPage } from './page';

// The DOM test of what the two views of the availability screen share
// (docs/FRONTEND_ARCHITECTURE.md section 8), on the real index.html. What each view does with
// these parts is in its own test; here is what neither can see alone: one dialog, opened by
// two views in turn.

const LIST = conflictList([{ appointmentId: 'appt-1', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }], 'Europe/Rome');
const said = (over: Partial<Confirmed> = {}): Confirmed => ({ busy: false, failure: null, conflicts: null, done: false, ...over });
const root = () => find('#availability');
const dialog = () => find<HTMLDialogElement>('#availability dialog.delete');
const inDialog = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#availability dialog.delete ${selector}`);
const shown = () => [dialog().open, inDialog('.question').textContent, inDialog('.error').textContent, inDialog('.conflicts').hidden, inDialog<HTMLButtonElement>('.submit').disabled];

describe('the parts the two views of the availability share', () => {
  useRealPage();

  describe('mountConfirm: one dialog, opened by two views in turn', () => {
    it('an opening shows its question and nothing else, and its button does what that opening was given', () => {
      const { open } = mountConfirm(root());
      const first = vi.fn();
      const second = vi.fn();
      open('First?', false, first);
      dialog().close();
      open('Second?', false, second);
      expect(shown()).toEqual([true, 'Second?', '', true, false]);
      inDialog('.submit').click();
      expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
    });

    it('opened while an action of its kind is under way, its button is disabled, and no failure is shown before it is pressed', () => {
      const { open } = mountConfirm(root());
      const tell = open('Sure?', true, vi.fn());
      expect(shown()).toEqual([true, 'Sure?', '', true, true]);
      tell(said({ failure: 'An earlier failure.', conflicts: LIST }));
      expect(shown()).toEqual([true, 'Sure?', '', true, false]);
    });

    it('what the view of an earlier opening tells is not said in the next one: no failure, no list, no close, and the button is left alone', () => {
      const { open } = mountConfirm(root());
      const earlier = open('A type?', false, vi.fn());
      inDialog('.submit').click();
      dialog().close();
      open('A date?', false, vi.fn());
      inDialog('.submit').click();
      earlier(said({ busy: true, failure: 'The type is in use.', conflicts: LIST }));
      expect(shown()).toEqual([true, 'A date?', '', true, false]);
      earlier(said({ done: true }));
      expect(dialog().open).toBe(true);
    });

    it('the opening that asked is told: the failure and the list, then closed when done', () => {
      const { open } = mountConfirm(root());
      const tell = open('Sure?', false, vi.fn());
      inDialog('.submit').click();
      tell(said({ failure: 'It failed.', conflicts: LIST }));
      expect([inDialog('.error').textContent, inDialog('.conflicts-count').textContent, inDialog('.conflicts-list').children.length]).toEqual(['It failed.', '1 appointment is in the way:', 1]);
      tell(said({ done: true }));
      expect(shown()).toEqual([false, 'Sure?', '', true, false]);
    });

    it('its end closes and empties the dialog, and an opening left behind is told nothing more', () => {
      const untouched = document.documentElement.outerHTML;
      const { open, subscription } = mountConfirm(root());
      const act = vi.fn();
      const tell = open('Sure?', false, act);
      inDialog('.submit').click();
      tell(said({ busy: true, failure: 'It failed.', conflicts: LIST }));
      subscription.unsubscribe();
      expect(document.documentElement.outerHTML).toBe(untouched);
      tell(said({ failure: 'Late.', conflicts: LIST }));
      inDialog('.submit').click();
      expect([document.documentElement.outerHTML === untouched, act.mock.calls.length]).toEqual([true, 1]);
    });
  });

  describe('availabilityParts: a form whose fields are checked', () => {
    it('a form with no failure line and no conflicts list of its own says its refusals and nothing else', () => {
      const { form } = availabilityParts(root());
      const choose = form('.one-date .choose', ['date']);
      choose.fill({ date: '2026-11-23' });
      choose.say({ refusals: { date: 'Choose a date.' }, failure: 'Not shown anywhere.', conflicts: LIST });
      expect([choose.held(), choose.fields[0]!.refusal.textContent, choose.fields[0]!.inputs[0]!.getAttribute('aria-invalid')]).toEqual([{ date: '2026-11-23' }, 'Choose a date.', 'true']);
      expect(document.documentElement.outerHTML).not.toContain('Not shown anywhere.');
      choose.say(null);
      expect([choose.fields[0]!.refusal.textContent, choose.fields[0]!.inputs[0]!.hasAttribute('aria-invalid')]).toEqual(['', false]);
    });

    it('a field named with an empty sentence is marked in fault and has no words under it; a field not named is not marked', () => {
      const { form } = availabilityParts(root());
      const add = form('.one-date .add-draft', ['start', 'end', 'typeId']);
      add.say({ refusals: { start: 'Start and End overlap.', end: '' }, failure: null, conflicts: null });
      // Both lists of a time are marked, and its sentence stands under its group.
      expect(add.fields.map(({ inputs, refusal }) => [inputs.map((input) => input.getAttribute('aria-invalid')), refusal.textContent])).toEqual([
        [['true', 'true'], 'Start and End overlap.'],
        [['true', 'true'], ''],
        [[null], ''],
      ]);
      expect(add.fields[0]!.refusal.closest('.field')!.querySelector('fieldset.clock')).toBe(add.fields[0]!.inputs[0]!.closest('fieldset'));
      add.say(null);
      expect(add.fields.flatMap(({ inputs }) => inputs.map((input) => input.hasAttribute('aria-invalid')))).toEqual([false, false, false, false, false]);
    });

    it('a time is two lists, an hour and a minute, held and filled as one `HH:mm` text', () => {
      const { form } = availabilityParts(root());
      const add = form('.one-date .add-draft', ['start', 'end', 'typeId']);
      expect(add.fields.map(({ inputs }) => inputs.map((input) => input.name))).toEqual([['start-hour', 'start-minute'], ['end-hour', 'end-minute'], ['typeId']]);
      expect(Object.keys(add.times)).toEqual(['start', 'end']);
      add.times.start!.offer(['09', '10']);
      add.times.end!.offer(['10', '24']);
      add.fill({ start: '09:05', end: '24:00', typeId: '' });
      expect(add.held()).toEqual({ start: '09:05', end: '24:00', typeId: '' });
      expect([...add.times.end!.lists[1].options].map((option) => option.value)).toEqual(['00']);
    });
  });
});
