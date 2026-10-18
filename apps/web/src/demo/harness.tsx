import { createRoot } from 'react-dom/client';
import { EmployerMentorDemo } from './EmployerMentorDemo';

// Development harness only. No production shell, authentication or API requests.
createRoot(document.getElementById('demo-root')!).render(<EmployerMentorDemo />);
