import { useState } from 'react';
import { deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from '../io/storage';
import { emptyProject } from '../model/defaults';
import { sampleProject } from '../model/neighborhood';
import { useStore } from '../store/store';
import { Icon } from './icons';

export function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={`modal-backdrop ${className}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
        <h4>5. מטיילים ונוסעים</h4>
        <p>
          ב<b>סיור</b> הולכים עם <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> (<kbd>Shift</kbd> – ריצה), קופצים עם <kbd>רווח</kbd> ועולים במדרגות. ליד אופניים, קורקינט או מכונית לוחצים{' '}
          <kbd>E</kbd> כדי לעלות: <kbd>W</kbd> גז, <kbd>S</kbd> בלם, <kbd>A</kbd>/<kbd>D</kbd> הגה, <kbd>H</kbd> צופר. בלילה הפנסים נדלקים לבד.
        </p>
        <h4>6. משחקים עם הבית והשכונה</h4>
        <p>
          כשהדמות מתקרבת לפריט אינטראקטיבי (מסומן ✨ בקטלוג) מופיעים כפתורי פעולה – <kbd>E</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>T</kbd>: לשבת
          ולשכב, להדליק אור, טלוויזיה ולהחליף ערוצים, לנגן בפסנתר, בגיטרה ובתופים, להפעיל מוזיקה ולרקוד, לבשל, להתקלח, להדליק אח, לישון,
          לרוץ על הליכון, לקפוץ בטרמפולינה, להתנדנד, להסתובב בקרוסלה, לגלוש, לבעוט בכדור לשער, לזרוק לסל ולחצים, ללטף את הכלב ולקרוא לו
          לבוא אחריכם.
        </p>
        <p>
          <kbd>1</kbd>–<kbd>5</kbd> תנועות (נפנוף, ריקוד, מחיאות כפיים…) · <kbd>רווח</kbd> קפיצה · <kbd>C</kbd> לקרוא לחיות · <kbd>P</kbd> צילום ·{' '}
          <kbd>N</kbd> יום / שקיעה / לילה · <kbd>M</kbd> השתקה. ב"הדמות שלי" מעצבים את הדמות.
        </p>
        <h4>7. יום ולילה, כוכבים ומדבקות</h4>
        <p>
          הסרגל שבפינה משנה את שעת היום (או נותן לזמן לרוץ לבד) – בלילה נדלקים פנסי הרחוב, המנורות והחלונות. בשכונה פזורים כוכבים
          לאיסוף, ובכפתור ⭐ שלמעלה מחכה אלבום מדבקות עם רעיונות למה לעשות – בלי שעון ובלי ניקוד.
        </p>
        <h4>קיצורי מקלדת</h4>
        <p>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> ביטול · <kbd>Ctrl</kbd>+<kbd>Y</kbd> ביצוע מחדש · <kbd>Delete</kbd> מחיקה · <kbd>Ctrl</kbd>+<kbd>D</kbd> שכפול ·{' '}
          <kbd>Esc</kbd> ביטול כלי · גלגלת – זום · גרירה על שטח ריק – הזזת המפה
        </p>
        <h4>קרדיטים</h4>
        <p className="note" dir="ltr" style={{ textAlign: 'left' }}>
          &quot;Oak trees pack&quot; and &quot;Bush models pack&quot; by LOLIPOP (@lolipop_1707), licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>{' '}
          (modified). Car models: Innerscene Free Parts Library (CC0). Textures and skies: CC0 (see assets/CREDITS.md).
        </p>
      </div>
    </Modal>
  );
}
