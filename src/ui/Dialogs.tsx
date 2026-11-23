import { useState } from 'react';
import { deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from '../io/storage';
import { emptyProject } from '../model/defaults';
import { sampleProject } from '../model/neighborhood';
import { useStore } from '../store/store';
import { Icon } from './icons';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const currentId = useStore((s) => s.project.id);
  const [list, setList] = useState<ProjectMeta[]>(() => {
    saveProject(useStore.getState().project);
    return listProjects();
  });
  const open = (kind: 'empty' | 'sample') => {
    saveProject(useStore.getState().project);
    useStore.getState().loadProject(kind === 'sample' ? sampleProject() : emptyProject());
    onClose();
  };
  return (
    <Modal title="הפרויקטים שלי" onClose={onClose}>
      <div className="row">
        <button className="btn primary" onClick={() => open('empty')}>
          <Icon name="plus" size={16} /> פרויקט חדש וריק
        </button>
        <button className="btn" onClick={() => open('sample')}>
          <Icon name="home" size={16} /> שכונה לדוגמה
        </button>
      </div>
      <ul className="project-list">
        {list.map((m) => (
          <li key={m.id} className={m.id === currentId ? 'current' : ''}>
            <button
              className="project-open"
              onClick={() => {
                if (m.id !== currentId) {
                  saveProject(useStore.getState().project);
                  const p = loadProject(m.id);
                  if (p) useStore.getState().loadProject(p);
                }
                onClose();
              }}
            >
              <strong>{m.name || 'ללא שם'}</strong>
              <small>עודכן {new Date(m.updatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</small>
            </button>
            {m.id !== currentId && (
              <button
                className="icon-btn"
                title="מחיקת הפרויקט"
                onClick={() => {
                  if (confirm(`למחוק את "${m.name}"? אי אפשר לבטל.`)) {
                    deleteProject(m.id);
                    setList(listProjects());
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="note">הפרויקטים נשמרים אוטומטית בדפדפן הזה. כדי לגבות או להעביר למחשב אחר – "גיבוי לקובץ".</p>
    </Modal>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="איך משחקים?" onClose={onClose}>
      <div className="help">
        <h4>1. בונים בית</h4>
        <p>
          במצב <b>תכנון בית</b> בחרו בכלי <b>חדר</b> וגררו מלבן. אפשר להצמיד חדרים זה לזה, או לשרטט קירות חופשיים עם הכלי <b>קיר</b>.
          הוסיפו דלתות וחלונות מהלשונית "דלתות וחלונות".
        </p>
        <h4>2. קומות וגג</h4>
        <p>
          הניחו <b>מדרגות</b> (בלשונית "בנייה") ולחצו <b>+ קומה</b> בפינת המסך: הקומה החדשה מתחילה מקווי המתאר של הקומה שמתחתיה, והפתח
          למדרגות נחתך לבד. את סוג הגג – שטוח או רעפים – בוחרים בלוח שמשמאל כששום דבר לא מסומן.
        </p>
        <h4>3. מעצבים</h4>
        <p>
          בחרו רהיט מהקטלוג ולחצו היכן שתרצו למקם אותו. <kbd>R</kbd> מסובב. רהיטים נצמדים לקירות לבד (<kbd>Alt</kbd> בזמן גרירה מבטל הצמדה).
          ב"חומרים וצבעים" בוחרים ריצוף, צבע או טפט ולוחצים על חדר.
        </p>
        <h4>4. בונים שכונה</h4>
        <p>
          במצב <b>שכונה</b> סוללים כבישים בגרירה, מסמנים גינות ורחבות, מוסיפים בתים ומבני ציבור מוכנים, עצים, מתקני משחק וכלי רכב. לחיצה
          כפולה על מבנה פותחת אותו לעריכה מבפנים.
        </p>
        <h4>5. מטיילים, נוסעים ומשחקים</h4>
        <p>
          ב<b>סיור</b> הולכים עם <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>, קופצים עם <kbd>רווח</kbd> ועולים במדרגות. <kbd>E</kbd> – לשבת, לשכב, להתגלש, להתנדנד, לעלות על אופניים או
          להיכנס למכונית. <kbd>F</kbd> – להפעיל דברים: להדליק אור וטלוויזיה, לפתוח ברז, ללטף את הכלב. ברכב: <kbd>W</kbd> גז, <kbd>S</kbd>{' '}
          בלם, <kbd>A</kbd>/<kbd>D</kbd> הגה, <kbd>H</kbd> צופר. במיטה: <kbd>Z</kbd> – לישון עד הבוקר. ליד פסנתר: יושבים ומנגנים במקשים 1–9.
        </p>
        <h4>6. יום ולילה, כוכבים ומדבקות</h4>
        <p>
          הסרגל שבפינה משנה את שעת היום (או נותן לזמן לרוץ לבד) – בלילה נדלקים הפנסים והחלונות. בשכונה פזורים כוכבים לאיסוף, ובכפתור
          ⭐ שלמעלה מחכה אלבום מדבקות עם רעיונות למה לעשות. 👤 פותח את מעצב הדמות, ו-📷 שומר תמונה.
        </p>
        <h4>קיצורי מקלדת</h4>
        <p>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> ביטול · <kbd>Ctrl</kbd>+<kbd>Y</kbd> ביצוע מחדש · <kbd>Delete</kbd> מחיקה · <kbd>Ctrl</kbd>+<kbd>D</kbd> שכפול ·{' '}
          <kbd>Esc</kbd> ביטול כלי · גלגלת – זום · גרירה על שטח ריק – הזזת המפה
        </p>
      </div>
    </Modal>
  );
}
