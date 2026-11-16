import { runShell } from '../common/app';
import { mountCalendar } from './calendar.view';
import { mountLogin } from './login.view';

runShell({ mountLogin, mountCalendar });
