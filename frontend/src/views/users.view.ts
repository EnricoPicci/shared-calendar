import type { Subscription } from 'rxjs';
import { failureText } from '../logic/texts';
import { deleteQuestion, editTitle, USERNAME_HINT, type UserRow } from '../logic/users.model';
import type { UsernameField, UsersScreen } from '../logic/users.screen';
import type { UsersService } from '../services/users.service';
import { editDialog, profileForm } from './profile.parts';

// What the users view uses: of the UsersScreen its stream, the create, the invitation's dialog,
// the edit and the new try after a read that failed; of the UsersService the delete with its
// state, for the dialog that confirms it.
export type UsersDeps = {
  screen: Pick<UsersScreen, 'users$' | 'create' | 'typed' | 'retry' | 'resend' | 'confirm' | 'closeInvite' | 'editOpened' | 'editTyped' | 'save'>;
  users: Pick<UsersService, 'deleteUser' | 'deleteUserState$'>;
};

// The users view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #users of
// index.html. It draws the rows the logic layer hands over, sends the form's fields as text at
// "Create user", shows the invitation's dialog the logic layer describes (the last look at the
// address, then where the invitation went or why not), opens the Edit dialog of a row, and asks
// before a delete.
export function mountUsers(root: HTMLElement, { screen, users }: UsersDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>('form.create');
  const field = find<HTMLInputElement>('[name="username"]');
  const facts = profileForm(form);
  const hint = find('.username-field .hint');
  const refusal = find('.username-field .refusal');
  const submit = find<HTMLButtonElement>('form.create .submit');
  const loading = find('.loading');
  const unread = find('.unread');
  const unreadWhy = find('.unread .error');
  const empty = find('.empty');
  const list = find('.list');
  const rowTemplate = find<HTMLTemplateElement>('#tpl-user-row');
  const invite = find<HTMLDialogElement>('dialog.invite');
  const inviteQuestion = find('dialog.invite .question');
  const inviteAnswer = find('dialog.invite .answer');
  const inviteError = find('dialog.invite .error');
  const inviteBack = find<HTMLButtonElement>('dialog.invite .back');
  const inviteSubmit = find<HTMLButtonElement>('dialog.invite .submit');
  const inviteDone = find<HTMLButtonElement>('dialog.invite .done');
  const remove = find<HTMLDialogElement>('dialog.delete');
  const question = find('dialog.delete .question');
  const removeError = find('dialog.delete .error');
  const removeSubmit = find<HTMLButtonElement>('dialog.delete .submit');
  const editTitleText = find('dialog.edit h3');
  // The user the Edit dialog is about, set when it opens.
  let editing = '';
  const edit = editDialog(find<HTMLDialogElement>('dialog.edit'), {
    opened: () => screen.editOpened(),
    typed: (fields) => screen.editTyped(fields),
    save: (fields) => screen.save(editing, fields),
  });

  // What a username is, under the field: the logic layer's words, which are also its refusal.
  hint.textContent = USERNAME_HINT;

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): which user the open
  // delete dialog is about, and whether its delete was asked for since it opened. A result is
  // shown only when it was asked for here: the state stream keeps its last value, which may be
  // an earlier opening's.
  let deleting = '';
  let deleteAsked = false;

  // 3. The invitation's dialog: the logic layer says whether it is open and what it shows. Its
  // three buttons and the Escape key only tell the logic layer; the Escape key closes it in the
  // browser too, and the next state agrees.
  inviteBack.onclick = () => screen.closeInvite();
  inviteDone.onclick = () => screen.closeInvite();
  inviteSubmit.onclick = () => screen.confirm();
  invite.oncancel = () => screen.closeInvite();

  // 4. The delete dialog: opening is a pure view action, and it starts clean. Nothing is done
  // when it closes, by "Keep", by the Escape key or after a success: whom it was about is
  // replaced at the next opening. A browser sends the close event a moment after the close,
  // which can be after the dialog was opened again: a handler that forgot would then forget
  // the new opening.
  const openDelete = (row: UserRow) => {
    deleting = row.username;
    deleteAsked = false;
    question.textContent = deleteQuestion(row.username);
    removeError.textContent = '';
    remove.showModal();
  };
  find('dialog.delete .keep').onclick = () => remove.close();
  removeSubmit.onclick = () => {
    deleteAsked = true;
    users.deleteUser(deleting);
  };

  // 5. Drawing the list: one copy of the template per row, filled with textContent. The
  // button's name for a screen reader says whom it deletes; a click only opens the dialog.
  const rowFor = (row: UserRow) => {
    const item = rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
    item.querySelector('.username')!.textContent = row.username;
    item.querySelector('.name')!.textContent = row.name;
    item.querySelector('.email')!.textContent = row.email;
    item.querySelector('.status')!.textContent = row.status;
    item.classList.toggle('is-invited', row.status === 'invited');
    const editButton = item.querySelector<HTMLElement>('.ask-edit')!;
    editButton.setAttribute('aria-label', row.editLabel);
    editButton.onclick = () => {
      editing = row.username;
      editTitleText.textContent = editTitle(row.username);
      edit.open(row.facts);
    };
    const resend = item.querySelector<HTMLElement>('.ask-resend')!;
    resend.hidden = row.resendLabel === null;
    if (row.resendLabel !== null) {
      resend.setAttribute('aria-label', row.resendLabel);
      resend.onclick = () => screen.resend(row);
    }
    const button = item.querySelector<HTMLElement>('.ask-delete')!;
    button.setAttribute('aria-label', row.deleteLabel);
    button.onclick = () => openDelete(row);
    return item;
  };
  // What is now in the page: the list is rebuilt only when the stream brings another one, so
  // the keyboard stays on a row's button; the form is filled only when the stream brings
  // another object for it, so what is being typed is left alone.
  let drawn: readonly UserRow[] | null = null;
  let filled: UsernameField | null = null;

  // 6. The user's actions become calls: what follows on screen comes from the streams.
  // Without preventDefault the browser would send the form itself and load the page again. The
  // fields go as they are, as text: the logic layer checks them.
  const typed = () => ({ username: field.value, ...facts.read() });
  form.oninput = () => screen.typed(typed());
  form.onsubmit = (event) => {
    event.preventDefault();
    screen.create(typed());
  };
  find('.retry').onclick = () => screen.retry();

  // 7. The streams' notifications fill the elements.
  const subscription = screen.users$.subscribe((state) => {
    loading.hidden = !state.loading;
    unread.hidden = state.unread === null;
    unreadWhy.textContent = state.unread ?? '';
    empty.hidden = state.empty === null;
    empty.textContent = state.empty ?? '';
    if (state.rows !== drawn) {
      drawn = state.rows;
      list.replaceChildren(...(drawn ?? []).map(rowFor));
    }
    if (state.field !== filled) {
      filled = state.field;
      field.value = filled.username;
      facts.fill(filled);
    }
    facts.refuse(state.refusals);
    edit.show(state.edit);
    // A field in fault: marked for a screen reader and for the style sheet, its sentence under it.
    refusal.textContent = state.refusal ?? '';
    if (state.refusal === null) field.removeAttribute('aria-invalid');
    else field.setAttribute('aria-invalid', 'true');
    // The invitation's dialog: its texts, and which buttons it offers. "Confirm" is off while
    // the call is under way; once it went, the answer takes the question's place and "Close"
    // alone stays.
    const look = state.invite;
    inviteQuestion.textContent = look?.question ?? '';
    inviteAnswer.textContent = look?.answer ?? '';
    inviteError.textContent = look?.failure ?? '';
    const went = look?.answer != null;
    inviteQuestion.hidden = went;
    inviteBack.hidden = went;
    inviteSubmit.hidden = went;
    // The keyboard was on a button that is now hidden: it goes to "Close", once.
    if (went && inviteDone.hidden) {
      inviteDone.hidden = false;
      inviteDone.focus();
    }
    inviteDone.hidden = !went;
    inviteSubmit.disabled = look?.sending ?? false;
    submit.disabled = look?.sending ?? false;
    if (look !== null && !invite.open) invite.showModal();
    if (look === null && invite.open) invite.close();
  });
  // A delete: its button is disabled while one is under way; the dialog that asked for it
  // closes on its success and shows its failure in plain words, staying open.
  subscription.add(
    users.deleteUserState$.subscribe((state) => {
      removeSubmit.disabled = state.status === 'pending';
      if (!deleteAsked) return;
      removeError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') remove.close();
    }),
  );

  // 8. Leaving the view: the element stays in the page, only hidden, so the addresses, the
  // usernames and what was typed are removed before the next screen, or the next person
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    invite.close();
    remove.close();
    edit.clear();
    editTitleText.textContent = '';
    facts.clear();
    form.reset();
    list.replaceChildren();
    field.removeAttribute('aria-invalid');
    for (const hidden of [loading, unread, empty]) hidden.hidden = true;
    for (const button of [submit, removeSubmit, inviteSubmit]) button.disabled = false;
    for (const shown of [inviteQuestion, inviteBack, inviteSubmit]) shown.hidden = false;
    inviteDone.hidden = true;
    for (const text of [hint, refusal, unreadWhy, empty, question, removeError, inviteQuestion, inviteAnswer, inviteError]) text.textContent = '';
  });
  return subscription;
}
