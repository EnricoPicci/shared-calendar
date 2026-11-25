import type { Subscription } from 'rxjs';
import type { MeScreen } from '../logic/me.screen';
import { editDialog } from './profile.parts';

// What the "My details" view uses of the MeScreen: its stream, the new try after a read that
// failed, and the Edit dialog's three actions.
export type MeDeps = Pick<MeScreen, 'me$' | 'retry' | 'editOpened' | 'editTyped' | 'save'>;

// The "My details" view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #me
// of index.html. It shows the person's own facts as the logic layer words them; for the
// Administrator it offers "Edit", which opens a dialog filled with the facts held; for a User it
// says to ask the Administrator for a change (docs/EMAIL_ARCHITECTURE.md section 4.2).
export function mountMe(root: HTMLElement, screen: MeDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loading = find('.loading');
  const unread = find('.unread');
  const unreadText = find('.unread .error');
  const details = find('.details');
  const texts = {
    username: find('.details .username'),
    role: find('.details .role'),
    givenName: find('.details .given-name'),
    familyName: find('.details .family-name'),
    email: find('.details .email'),
    address: find('.details .address'),
  };
  const userOnly = find('.user-only');
  const askEdit = find<HTMLButtonElement>('.ask-edit');
  const edit = editDialog(find<HTMLDialogElement>('dialog.edit'), {
    opened: () => screen.editOpened(),
    typed: (fields) => screen.editTyped(fields),
    save: (fields) => screen.save(fields),
  });

  // 2. The user's actions become calls. "Edit" fills the dialog with the facts of the last read.
  find<HTMLButtonElement>('.unread .retry').onclick = () => screen.retry();
  let fields: Parameters<typeof edit.open>[0] | null = null;
  askEdit.onclick = () => {
    if (fields !== null) edit.open(fields);
  };

  // 3. The stream's notifications fill the elements.
  const subscription = screen.me$.subscribe((state) => {
    loading.hidden = !state.loading;
    unread.hidden = state.unread === null;
    unreadText.textContent = state.unread ?? '';
    details.hidden = state.details === null;
    for (const [key, element] of Object.entries(texts)) element.textContent = state.details?.[key as keyof typeof texts] ?? '';
    fields = state.fields;
    askEdit.hidden = !state.canEdit || state.fields === null;
    userOnly.hidden = state.canEdit || state.details === null;
    edit.show(state.edit);
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so every fact is removed
  // before the next screen, or the next person (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    edit.clear();
    find<HTMLButtonElement>('.unread .retry').onclick = null;
    askEdit.onclick = null;
    loading.hidden = true;
    unread.hidden = true;
    unreadText.textContent = '';
    details.hidden = true;
    for (const element of Object.values(texts)) element.textContent = '';
    askEdit.hidden = true;
    userOnly.hidden = true;
  });
  return subscription;
}
