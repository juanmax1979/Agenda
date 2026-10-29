import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime, timedelta
import os
import socket
import json
import sys
import sqlite3
import calendar
import logging

# 🌟 BLINDAJE DE CARPETAS
if getattr(sys, 'frozen', False):
    os.chdir(os.path.dirname(sys.executable))
else:
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    from tkcalendar import DateEntry
    HAY_CALENDARIO = True
except ImportError:
    HAY_CALENDARIO = False

# ══════════════════════════════════════════════════════════════
# 🌐 CONFIGURACIÓN DE BASE DE DATOS
# ══════════════════════════════════════════════════════════════

# Ruta de la base compartida en Z: (red del tribunal)
RUTA_DB_RED = r"Z:\Proteus\Biblioratos\numerador.db"

if os.path.exists(os.path.dirname(RUTA_DB_RED)):
    RUTA_DB = RUTA_DB_RED
    MODO_RED = True
    print("🏛️  Modo TRIBUNAL — Base compartida en Z:")
else:
    RUTA_DB = "numerador.db"
    MODO_RED = False
    print("💾 Modo LOCAL — Z: no accesible")

# 🔒 SEGURIDAD INSTITUCIONAL:
# Para evitar numeración paralela, en producción no se permite numerar si no está Z:
PERMITIR_MODO_LOCAL = False

if not MODO_RED and not PERMITIR_MODO_LOCAL:
    try:
        root_tmp = tk.Tk()
        root_tmp.withdraw()
        messagebox.showerror(
            "Base compartida no disponible",
            "No se encuentra la unidad Z:\\Proteus\\Biblioratos.\n\n"
            "Por seguridad, el numerador no puede abrir en modo local,\n"
            "ya que podría generar números paralelos no registrados en la base compartida."
        )
        root_tmp.destroy()
    except Exception:
        pass
    sys.exit()


# 🎨 PALETA DE COLORES POR PESTAÑA
COLORES_PESTANAS = {
    "OFICIO":               {"fondo": "#EAF0F7", "acento": "#3B7DD8", "titulo": "#2C5F9E"},
    "AUTO":                 {"fondo": "#F0EAF7", "acento": "#7B3DD8", "titulo": "#5C2E9E"},
    "SENTENCIA TRAMITE":    {"fondo": "#EAFAF0", "acento": "#2DA86A", "titulo": "#1E7A4D"},
    "SENTENCIA RELATORIA":  {"fondo": "#FFF7EA", "acento": "#D89B3B", "titulo": "#9E7A2C"},
    "AGENDA":               {"fondo": "#FFEAEA", "acento": "#C0392B", "titulo": "#922B21"},
}

# 📝 CATEGORÍAS — se cargan desde categorias.json (editalo con Bloc de Notas o VS Code)
try:
    with open("categorias.json", "r", encoding="utf-8") as f:
        SUGERENCIAS_POR_TIPO = json.load(f)
    print("📋 Categorías cargadas desde categorias.json")
except:
    print("⚠️  No se encontró categorias.json — usando valores vacíos")
    SUGERENCIAS_POR_TIPO = {}

# 📅 Agenda: avisos automáticos al iniciar.
# En False arranca más rápido y los avisos se consultan manualmente desde Agenda.
AVISOS_AGENDA_AL_INICIO = False

# 👥 DICCIONARIO DE USUARIOS POR DEFECTO (solo se usa para poblar la DB la primera vez)
USUARIOS = {
    "Ayala Sartor Renzo E.": {"pass": "admin123", "rol": "admin"},
    "Mujica Jorge": {"pass": "admin123", "rol": "admin"},
    "Unger Nancy B.": {"pass": "1234", "rol": "user"},
    "Igich Patricia": {"pass": "1234", "rol": "user"},
    "Oleschuk Micaela": {"pass": "1234", "rol": "user"},
    "Berndt Lucas": {"pass": "1234", "rol": "user"},
    "Alvarez Matias": {"pass": "1234", "rol": "user"},
    "Bazan Facundo": {"pass": "1234", "rol": "user"},
    "Proteus (Robot)": {"pass": "robot", "rol": "robot"}
}

DICCIONARIO_MESES = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
}


# ══════════════════════════════════════════════════════════════
# 🧾 LOG DEL SISTEMA
# ══════════════════════════════════════════════════════════════

try:
    CARPETA_LOGS = os.path.join(os.path.dirname(RUTA_DB), "logs")
    os.makedirs(CARPETA_LOGS, exist_ok=True)
    ARCHIVO_LOG = os.path.join(CARPETA_LOGS, "biblioratos.log")
except Exception:
    CARPETA_LOGS = "logs"
    os.makedirs(CARPETA_LOGS, exist_ok=True)
    ARCHIVO_LOG = os.path.join(CARPETA_LOGS, "biblioratos.log")

logging.basicConfig(
    filename=ARCHIVO_LOG,
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    encoding="utf-8"
)

def log_sistema(mensaje, nivel="info"):
    """
    Guarda mensajes técnicos del sistema.
    Reemplaza print() para que el .exe sin consola no pierda información.
    """
    try:
        if nivel == "warning":
            logging.warning(mensaje)
        elif nivel == "error":
            logging.error(mensaje)
        else:
            logging.info(mensaje)
    except Exception:
        pass
log_sistema(
    f"Inicio del sistema | Modo: {'TRIBUNAL Z:' if MODO_RED else 'LOCAL'} | Ruta DB: {RUTA_DB}"
)

def ruta_recurso(nombre_archivo):
    """
    Devuelve la ruta correcta del recurso tanto en .py normal
    como en .exe generado con PyInstaller --onefile.
    """
    try:
        base = sys._MEIPASS
    except Exception:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, nombre_archivo)


def normalizar_expte_basico(raw):
    """
    Normaliza expedientes tipo:
    4559/2023/4 -> 4559/2023-4
    4559 / 2023 - 4 -> 4559/2023-4

    Si no cumple el formato mínimo, devuelve el texto limpio para no bloquear cargas excepcionales.
    """
    if not raw:
        return ""

    t = raw.strip().replace(" ", "")

    if t.count("/") == 2 and "-" not in t:
        a, b = t.rsplit("/", 1)
        t = f"{a}-{b}"

    return t.upper()
# ══════════════════════════════════════════════════════════════
# 📅 AGENDA — TAXONOMÍA Y MOTOR DE DÍAS HÁBILES
# ══════════════════════════════════════════════════════════════

# Actos que requieren inmediación del Juez (no se superponen entre sí)
TIPOS_AGENDA_BLOQUEANTES = [
    "Lectura / Firma de Sentencia",
    "Audiencia de Debate",
    "Audiencia Preliminar",
    "Nueva Audiencia Preliminar",
    "Audiencia de Visu",
    "Audiencia de Conciliación",
]

# Actos delegables a Secretaría (permiten superposición horaria)
TIPOS_AGENDA_CONCURRENTES = [
    "Cita Damnificada",
    "Cita Damnificada/Probation",
    "Cita Damnificada/Mediación",
    "Cita Damnificada/Conciliación",
    "Cita Imputado",
    "Cita Imputado/Reglas de Conducta",
    "Admisión de Pruebas",
]

# Tipos internos del sistema: no conviene borrarlos porque los usan
# el botón de vencimientos, filtros y registros históricos.
TIPOS_AGENDA_INTERNOS = [
    "Vencimiento de Plazo",
    "Trámite / Otro",
]

TIPOS_AGENDA_TODOS = TIPOS_AGENDA_BLOQUEANTES + TIPOS_AGENDA_CONCURRENTES + TIPOS_AGENDA_INTERNOS

ESTADOS_AGENDA = ["Pendiente", "Realizada", "Fracasada", "Suspendida"]

# Feriados nacionales / provinciales con su nombre (se muestra arriba al seleccionar)
FERIADOS_FIJOS = {
    (1, 1):   "Año Nuevo",
    (3, 24):  "Día Nacional de la Memoria",
    (4, 2):   "Día del Veterano y Caídos en Malvinas",
    (5, 1):   "Día del Trabajador",
    (5, 25):  "Revolución de Mayo",
    (6, 17):  "Paso a la Inmortalidad del Gral. Güemes",
    (6, 20):  "Paso a la Inmortalidad del Gral. Belgrano",
    (7, 9):   "Día de la Independencia",
    (8, 8):   "Provincialización del Chaco",
    (8, 17):  "Paso a la Inmortalidad del Gral. San Martín",
    (10, 12): "Día del Respeto a la Diversidad Cultural",
    (11, 16): "Día del Empleado Judicial",
    (11, 20): "Día de la Soberanía Nacional",
    (12, 8):  "Inmaculada Concepción",
    (12, 25): "Navidad",
}

NOMBRES_MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio",
                    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Feria de Invierno — varía por Acordada del STJ Chaco. AGREGAR cada año:
FERIAS_INVIERNO = {
    2026: ("2026-07-13", "2026-07-24"),
    # 2027: ("2027-07-XX", "2027-07-YY"),  # agregar cuando salga la Acordada
}

# Caches en memoria (se llenan al iniciar desde la tabla feriados)
_FERIADOS_PERMANENTES = {}   # {(mes, día): "descripción"}
_FERIADOS_EXCEPCIONALES = {} # {"YYYY-MM-DD": "descripción"}

# Plantilla de decreto por defecto (puede ser modificada desde el panel admin)
DECRETO_DEFAULT = (
    "Por presentado, parte y constituido el domicilio. "
    "Atento al estado de autos en el expediente caratulado \"{expte}\", "
    "fíjase {tipo} para el día {fecha_larga} a las {hora} horas. "
    "Notifíquese a las partes en sus domicilios constituidos, "
    "bajo apercibimiento de ley. Hágase saber, ofíciese y cúmplase."
)


def cargar_feriados_de_db(conn):
    """Llena los caches en memoria desde la tabla feriados."""
    global _FERIADOS_PERMANENTES, _FERIADOS_EXCEPCIONALES
    _FERIADOS_PERMANENTES = {}
    _FERIADOS_EXCEPCIONALES = {}
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT fecha, descripcion, tipo FROM feriados")
        for fecha, desc, tipo in cursor.fetchall():
            if tipo == "PERMANENTE":
                try:
                    m, d = fecha.split("-")
                    _FERIADOS_PERMANENTES[(int(m), int(d))] = desc
                except Exception:
                    pass
            elif tipo == "EXCEPCIONAL":
                _FERIADOS_EXCEPCIONALES[fecha] = desc
    except Exception:
        pass


def es_dia_habil(fecha):
    """Devuelve (bool, motivo). Bloquea fines de semana, feria de verano,
    feria de invierno, feriados permanentes y feriados excepcionales (cargados desde DB)."""
    if fecha.weekday() >= 5:
        return False, "Fin de semana (sábado/domingo)"
    if fecha.month == 1:
        return False, "Feria Judicial de Verano (enero)"
    feria = FERIAS_INVIERNO.get(fecha.year)
    if feria:
        desde, hasta = feria
        f_str = fecha.strftime("%Y-%m-%d")
        if desde <= f_str <= hasta:
            return False, f"Feria Judicial de Invierno ({desde} a {hasta})"
    # Feriado excepcional (fecha exacta) tiene prioridad sobre permanente
    f_str_full = fecha.strftime("%Y-%m-%d")
    if f_str_full in _FERIADOS_EXCEPCIONALES:
        return False, _FERIADOS_EXCEPCIONALES[f_str_full]
    nombre = _FERIADOS_PERMANENTES.get((fecha.month, fecha.day))
    if nombre:
        return False, nombre
    # Compatibilidad con FERIADOS_FIJOS hardcodeados (si alguno no se migró aún)
    nombre = FERIADOS_FIJOS.get((fecha.month, fecha.day))
    if nombre:
        return False, nombre
    return True, "Día hábil"

def conectar_db():
    """
    Conexión conservadora para SQLite compartido en red.
    Esta lógica se parece más a la versión estable anterior.
    Evitamos WAL porque en unidad Z: puede generar bloqueos entre usuarios.
    """
    conn = sqlite3.connect(RUTA_DB, timeout=30, check_same_thread=False)
    conn.isolation_level = None

    # Más espera ante base ocupada, sin cambiar el modo de journal.
    try:
        conn.execute("PRAGMA busy_timeout = 30000")
    except Exception:
        pass

    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS registros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            numero INTEGER,
            anio INTEGER,
            expediente TEXT,
            detalle TEXT,
            usuario TEXT,
            fecha TIMESTAMP,
            remitido INTEGER DEFAULT 0,
            remitido_por TEXT DEFAULT '',
            remitido_fecha TEXT DEFAULT ''
        )
    """)

    # 🔒 IMPORTANTE:
    # No crear índice único automáticamente al iniciar.
    # La base tiene duplicados históricos y, en red, intentar crear índices únicos
    # puede bloquear a otros usuarios. La auditoría de duplicados debe hacerse
    # manualmente desde una herramienta aparte, con todos los usuarios fuera.

    # Migraciones
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido INTEGER DEFAULT 0")
    except: pass
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido_por TEXT DEFAULT ''")
    except: pass
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido_fecha TEXT DEFAULT ''")
    except: pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sesiones (
            usuario TEXT PRIMARY KEY,
            pc_name TEXT,
            fecha_login TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            nombre TEXT PRIMARY KEY,
            password TEXT,
            rol TEXT
        )
    """)

    # 📋 TABLA DE AUDITORÍA
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS log_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            registro_id INTEGER,
            accion TEXT,
            campo_modificado TEXT,
            valor_anterior TEXT,
            valor_nuevo TEXT,
            usuario TEXT,
            fecha TIMESTAMP,
            pc_name TEXT DEFAULT ''
        )
    """)

    try: cursor.execute("ALTER TABLE log_auditoria ADD COLUMN pc_name TEXT DEFAULT ''")
    except: pass

    # 📅 TABLA DE AGENDA — audiencias y vencimientos compartidos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agenda (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            expediente TEXT,
            descripcion TEXT DEFAULT '',
            anotacion TEXT DEFAULT '',
            fecha DATE,
            hora TEXT DEFAULT '',
            detenido INTEGER DEFAULT 0,
            estado TEXT DEFAULT 'Pendiente',
            usuario_carga TEXT,
            fecha_carga TIMESTAMP,
            usuario_resolucion TEXT DEFAULT '',
            fecha_resolucion TIMESTAMP DEFAULT NULL,
            notas TEXT DEFAULT ''
        )
    """)

    try: cursor.execute("ALTER TABLE agenda ADD COLUMN anotacion TEXT DEFAULT ''")
    except: pass

    # ⚡ ÍNDICES DE AGENDA:
    # Aceleran cambio de mes, búsqueda por día, control de colisiones y grilla diaria.
    # Índices de agenda: útiles, pero no deben impedir el inicio si la base está ocupada.
    try:
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_agenda_fecha
            ON agenda(fecha)
        """)
    except Exception as e:
        log_sistema(f"No se pudo crear/verificar idx_agenda_fecha: {e}", "warning")

    try:
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_agenda_fecha_hora_estado_tipo
            ON agenda(fecha, hora, estado, tipo)
        """)
    except Exception as e:
        log_sistema(f"No se pudo crear/verificar idx_agenda_fecha_hora_estado_tipo: {e}", "warning")

    try:
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_agenda_usuario_fecha
            ON agenda(usuario_carga, fecha)
        """)
    except Exception as e:
        log_sistema(f"No se pudo crear/verificar idx_agenda_usuario_fecha: {e}", "warning")

    # 🗓 TABLA DE FERIADOS — permanentes (formato MM-DD) y excepcionales (YYYY-MM-DD)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS feriados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('PERMANENTE', 'EXCEPCIONAL')),
            UNIQUE(fecha, tipo)
        )
    """)

    # ⚙ TABLA DE CONFIGURACIÓN (clave/valor) — plantilla del decreto, etc.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT
        )
    """)

    # Población inicial de feriados permanentes (solo la primera vez)
    cursor.execute("SELECT COUNT(*) FROM feriados WHERE tipo='PERMANENTE'")
    if cursor.fetchone()[0] == 0:
        for (mes, dia), nombre in FERIADOS_FIJOS.items():
            try:
                cursor.execute("INSERT OR IGNORE INTO feriados (fecha, descripcion, tipo) VALUES (?, ?, 'PERMANENTE')",
                               (f"{mes:02d}-{dia:02d}", nombre))
            except Exception:
                pass

    cursor.execute("SELECT COUNT(*) FROM usuarios")
    if cursor.fetchone()[0] == 0:
        for k, v in USUARIOS.items():
            cursor.execute("INSERT INTO usuarios VALUES (?, ?, ?)", (k, v["pass"], v["rol"]))

    conn.commit()

    # Cargar feriados al cache global en memoria
    cargar_feriados_de_db(conn)

    return conn

def obtener_nuevo_numero(conn, tipo):
    cursor = conn.cursor()
    anio_actual = datetime.now().year
    cursor.execute(
        "SELECT MAX(numero) FROM registros WHERE tipo = ? AND anio = ?",
        (tipo, anio_actual)
    )
    resultado = cursor.fetchone()[0]
    if resultado is None:
        return 1
    return resultado + 1


def registrar_auditoria(conn, registro_id, accion, campo, valor_ant, valor_nuevo, usuario):
    """Escribe una entrada en la tabla log_auditoria."""
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        pc_name = socket.gethostname()
    except Exception:
        pc_name = ""

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO log_auditoria
        (registro_id, accion, campo_modificado, valor_anterior, valor_nuevo, usuario, fecha, pc_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (registro_id, accion, campo, valor_ant, valor_nuevo, usuario, ahora, pc_name))
# ══════════════════════════════════════════════════════════════
# APLICACIÓN PRINCIPAL
# ══════════════════════════════════════════════════════════════
class NumeradorApp:
    def __init__(self, root, usuario_actual, rol_actual):
        self.root = root
        self.usuario_actual = usuario_actual
        self.rol_actual = rol_actual

        self.root.title("🏛️ Biblioratos — Juzgado Correccional - Iv. Circ. Judicial - Charata")
        self.root.geometry("1050x800")

        try:
            self.root.iconbitmap(ruta_recurso("icono.ico"))
        except Exception:
            pass

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after_idle(self.root.attributes, '-topmost', False)
        self.root.protocol("WM_DELETE_WINDOW", self.cerrar_aplicacion)

        self.conn = conectar_db()
        self.funciones_actualizar = []

        # ── Estilos ──────────────────────────────────────────
        style = ttk.Style()
        style.theme_use('clam')

        style.configure("Treeview", font=("Segoe UI", 9), rowheight=24)
        style.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"), background="#D5D5D5")
        style.map("Treeview", background=[('selected', '#3B7DD8')], foreground=[('selected', 'white')])

        # Tags de color para filas
        # (los configuramos en cada Treeview después de crearlo)

        style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"))
        style.configure("TCombobox", font=("Segoe UI", 11))
        self.root.option_add("*TCombobox*Listbox.font", ("Segoe UI", 11))
        style.configure("ProximoNum.TLabel", font=("Segoe UI", 13, "bold"), foreground="#FFFFFF", background="#3B7DD8")

        # ── Barra superior ───────────────────────────────────
        top_bar = tk.Frame(self.root, bg="#2C3E50", height=45)
        top_bar.pack(fill="x")
        top_bar.pack_propagate(False)

        tk.Label(top_bar, text=f"👤 {self.usuario_actual}",
                 font=("Segoe UI", 11, "bold"), bg="#2C3E50", fg="white").pack(side="left", padx=15)

        tk.Label(top_bar, text=f"({self.rol_actual.upper()})",
                 font=("Segoe UI", 9), bg="#2C3E50", fg="#BDC3C7").pack(side="left")
        # 🌐 STATUS DE CONEXIÓN
        if MODO_RED:
            estado_txt = "🏢 Juzgado (Z:)"
            estado_color = "#27AE60"
        else:
            estado_txt = "💾 Local"
            estado_color = "#F39C12"

        self.lbl_status = tk.Label(top_bar, text=estado_txt, font=("Segoe UI", 9, "bold"),
                                    bg=estado_color, fg="white", padx=8, pady=2, relief="groove")
        self.lbl_status.pack(side="right", padx=5, pady=7)

        ttk.Button(top_bar, text="🔑 Cambiar Contraseña", command=self.cambiar_password).pack(side="right", padx=10, pady=7)

        if self.usuario_actual in ("Ayala Sartor Renzo E.", "Mujica Jorge"):
            ttk.Button(top_bar, text="👑 Panel de Juez", command=self.panel_superusuario).pack(side="right", padx=10, pady=7)

        # ── Notebook (pestañas) ──────────────────────────────
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(pady=5, expand=True, fill="both", padx=10)

        self.tab_oficios = ttk.Frame(self.notebook)
        self.tab_autos = ttk.Frame(self.notebook)
        self.tab_sent_tramite = ttk.Frame(self.notebook)
        self.tab_sent_relatoria = ttk.Frame(self.notebook)
        self.tab_buscador = ttk.Frame(self.notebook)
        self.tab_agenda = ttk.Frame(self.notebook)
        self.tab_estadisticas = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_oficios, text="  📝 Oficios  ")
        self.notebook.add(self.tab_autos, text="  ⚖️ Auto/Interlocutorios  ")
        self.notebook.add(self.tab_sent_tramite, text="  📜 Sentencias - Sec. Trámite  ")
        self.notebook.add(self.tab_sent_relatoria, text="  📜 Sentencias - Sec. Relatora  ")
        self.notebook.add(self.tab_buscador, text="  🔍 Buscador  ")
        self.notebook.add(self.tab_agenda, text="  📅 Agenda  ")
        self.notebook.add(self.tab_estadisticas, text="  📊 Estadísticas  ")

        self.construir_pestaña_ingreso(self.tab_oficios, "OFICIO")
        self.construir_pestaña_ingreso(self.tab_autos, "AUTO")
        self.construir_pestaña_ingreso(self.tab_sent_tramite, "SENTENCIA TRAMITE")
        self.construir_pestaña_ingreso(self.tab_sent_relatoria, "SENTENCIA RELATORIA")
        self.construir_pestaña_buscador()
        self.construir_pestaña_agenda()
        self.construir_pestaña_estadisticas()

        # Aviso de agenda al iniciar.
        # Desactivado por defecto para evitar demora al abrir el .exe.
        if AVISOS_AGENDA_AL_INICIO:
            self.root.after(700, self.verificar_alertas_agenda)

    # ──────────────────────────────────────────────────────────
    # CERRAR
    # ──────────────────────────────────────────────────────────
    def cerrar_aplicacion(self):
        try:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM sesiones WHERE usuario = ?", (self.usuario_actual,))
            self.conn.commit()
        except:
            pass
        self.root.destroy()

    def _begin_exclusive(self):
        """
        Inicio de transacción compatible con la versión estable anterior.
        En red, se evita romper el flujo si no puede tomar bloqueo exclusivo inmediato.
        """
        try:
            self.conn.execute("BEGIN EXCLUSIVE")
        except Exception:
            pass

    def _commit_y_sync(self):
        """Commit a la base compartida en Z:."""
        self.conn.commit()

    def _safe_rollback(self):
        """Rollback seguro — libsql puede no soportar rollback en todos los contextos."""
        try:
            self.conn.rollback()
        except Exception:
            pass

    def _centrar_popup(self, pop, ancho, alto, modal=True, redimensionable=False):
        """
        Centra cualquier ventana secundaria respecto de la ventana principal.
        Usar para todos los tk.Toplevel: Agregar, Modificar, Sumar días,
        Copiar fecha, Listado, Cambiar contraseña, Paneles admin, etc.
        """
        pop.transient(self.root)
        pop.resizable(redimensionable, redimensionable)

        self.root.update_idletasks()

        root_x = self.root.winfo_rootx()
        root_y = self.root.winfo_rooty()
        root_w = self.root.winfo_width()
        root_h = self.root.winfo_height()

        x = root_x + (root_w // 2) - (ancho // 2)
        y = root_y + (root_h // 2) - (alto // 2)

        pop.geometry(f"{ancho}x{alto}+{x}+{y}")

        if modal:
            pop.grab_set()

        pop.lift()
        pop.focus_force()

    # ──────────────────────────────────────────────────────────
    # HELPER: Aplicar zebra striping + resaltar ANULADOS
    # ──────────────────────────────────────────────────────────
    def _configurar_tags_treeview(self, tree, color_fondo):
        """Configura los tags para zebra striping y ANULADOS."""
        tree.tag_configure("par", background=color_fondo)
        tree.tag_configure("impar", background="#FFFFFF")
        tree.tag_configure("anulado", background="#FDDDDD", foreground="#CC0000", font=("Segoe UI", 10, "overstrike"))

    def _aplicar_zebra(self, tree):
        """Re-aplica los tags de colores después de insertar filas."""
        items = tree.get_children()
        for i, item in enumerate(items):
            valores = tree.item(item)['values']
            # Detectar si es ANULADO: buscar en expediente
            es_anulado = False
            for v in valores:
                if str(v).strip().upper() == "ANULADO":
                    es_anulado = True
                    break
            if es_anulado:
                tree.item(item, tags=("anulado",))
            elif i % 2 == 0:
                tree.item(item, tags=("par",))
            else:
                tree.item(item, tags=("impar",))

    # ──────────────────────────────────────────────────────────
    # PESTAÑA DE INGRESO (una por tipo)
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_ingreso(self, frame, tipo_doc):
        colores = COLORES_PESTANAS.get(tipo_doc, {"fondo": "#F5F5F5", "acento": "#555", "titulo": "#333"})

        # ── Panel superior con color de identidad ────────────
        top_frame = tk.Frame(frame, bg=colores["fondo"])
        top_frame.pack(fill="x", pady=0)

        header = tk.Frame(top_frame, bg=colores["acento"], height=50)
        header.pack(fill="x")
        header.pack_propagate(False)

        NOMBRES_BONITOS = {
            "OFICIO": "OFICIOS",
            "AUTO": "AUTO / INTERLOCUTORIOS",
            "SENTENCIA TRAMITE": "SENTENCIAS - Sec. Trámite",
            "SENTENCIA RELATORIA": "SENTENCIAS - Sec. Relatora",
        }
        tk.Label(header, text=f"  {NOMBRES_BONITOS.get(tipo_doc, tipo_doc)}",
                 font=("Segoe UI", 15, "bold"), bg=colores["acento"], fg="white").pack(side="left", padx=10)

        # 🔢 CONTADOR DE PRÓXIMO NÚMERO
        proximo = obtener_nuevo_numero(self.conn, tipo_doc)
        lbl_proximo = tk.Label(header,
                               text=f"  Próximo N°: {proximo}  ",
                               font=("Segoe UI", 13, "bold"),
                               bg="white", fg=colores["acento"],
                               relief="groove", padx=10, pady=2)
        lbl_proximo.pack(side="right", padx=(0, 15), pady=8)

        # 🔄 BOTÓN REFRESCAR junto al próximo número
        def refrescar_proximo():
            nuevo = obtener_nuevo_numero(self.conn, tipo_doc)
            lbl_proximo.config(text=f"  Próximo N°: {nuevo}  ")

        btn_refresh_prox = tk.Button(header, text="🔄", font=("Segoe UI", 11),
                                     bg="white", fg=colores["acento"], relief="flat",
                                     cursor="hand2", command=refrescar_proximo)
        btn_refresh_prox.pack(side="right", padx=(5, 0), pady=8)

        # ── Formulario ───────────────────────────────────────
        form_frame = tk.Frame(top_frame, bg=colores["fondo"])
        form_frame.pack(pady=10)

        tk.Label(form_frame, text="Expte Nro:", font=("Segoe UI", 10),
                 bg=colores["fondo"]).grid(row=0, column=0, padx=5, pady=5, sticky="e")
        ent_expte = ttk.Entry(form_frame, width=30)
        ent_expte.grid(row=0, column=1, padx=5, pady=5)

        tk.Label(form_frame, text="Descripción:", font=("Segoe UI", 10),
                 bg=colores["fondo"]).grid(row=1, column=0, padx=5, pady=5, sticky="e")

        # ── Combobox con categorías agrupadas ────────────────
        sugerencias = SUGERENCIAS_POR_TIPO.get(tipo_doc, {})

        items_combo = []
        mapa_resultado = []

        sugerencias_con_otros = dict(sugerencias) if isinstance(sugerencias, dict) else {}
        sugerencias_con_otros["── OTROS ──"] = []

        for categoria, sub_opciones in sugerencias_con_otros.items():
            if categoria == "── OTROS ──":
                items_combo.append("── OTROS ──")
                mapa_resultado.append("OTROS")
            elif not sub_opciones:
                items_combo.append(categoria)
                mapa_resultado.append(f"Of. {categoria}" if tipo_doc == "OFICIO" else categoria)
            else:
                items_combo.append(f"▸ {categoria.upper()}")
                mapa_resultado.append(None)
                for sub in sub_opciones:
                    display = f"     {sub}"
                    items_combo.append(display)
                    mapa_resultado.append(f"Of. {categoria} ({sub})" if tipo_doc == "OFICIO" else f"{categoria} ({sub})")

        ent_detalle = ttk.Combobox(form_frame, width=42, values=items_combo, state="readonly")
        ent_detalle.grid(row=1, column=1, padx=5, pady=5)

        lbl_otros = tk.Label(form_frame, text="Especificar:", font=("Segoe UI", 10), bg=colores["fondo"])
        ent_otros = ttk.Entry(form_frame, width=42)

        def al_seleccionar(event=None):
            sel = ent_detalle.get()
            if sel.startswith("▸ "):
                ent_detalle.set("")
                lbl_otros.grid_remove()
                ent_otros.grid_remove()
                return
            if sel == "── OTROS ──":
                lbl_otros.grid(row=2, column=0, padx=5, pady=3, sticky="e")
                ent_otros.grid(row=2, column=1, padx=5, pady=3)
                ent_otros.focus()
            else:
                lbl_otros.grid_remove()
                ent_otros.grid_remove()
                ent_otros.delete(0, tk.END)

        ent_detalle.bind("<<ComboboxSelected>>", al_seleccionar)

        def obtener_detalle():
            sel = ent_detalle.get()
            if sel == "── OTROS ──":
                return ent_otros.get().strip().title()
            try:
                idx = ent_detalle.current()
                if idx >= 0 and idx < len(mapa_resultado) and mapa_resultado[idx]:
                    return mapa_resultado[idx]
            except:
                pass
            return sel.strip()

        def limpiar_detalle():
            ent_detalle.set("")
            ent_otros.delete(0, tk.END)
            lbl_otros.grid_remove()
            ent_otros.grid_remove()

        lbl_resultado = tk.Label(top_frame, text="", font=("Segoe UI", 12, "bold"),
                                 fg=colores["titulo"], bg=colores["fondo"])

        def guardar():
            expte = ent_expte.get().strip()
            detalle = obtener_detalle()

            if not expte:
                messagebox.showwarning("Atención", "Debe ingresar el número de expediente.")
                return

            # 🔒 Reintento breve por si otra PC tomó el mismo número justo antes.
            # El índice único idx_registros_tipo_anio_numero es el verdadero blindaje.
            intentos = 2

            for intento in range(intentos):
                try:
                    self._begin_exclusive()
                    cursor = self.conn.cursor()

                    nuevo_num = obtener_nuevo_numero(self.conn, tipo_doc)
                    anio = datetime.now().year
                    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    cursor.execute("""
                        INSERT INTO registros (tipo, numero, anio, expediente, detalle, usuario, fecha)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (tipo_doc, nuevo_num, anio, expte, detalle, self.usuario_actual, ahora))

                    reg_id = cursor.lastrowid

                    registrar_auditoria(
                        self.conn,
                        reg_id,
                        "CREACION",
                        "-",
                        "-",
                        f"{tipo_doc} N° {nuevo_num}/{anio}",
                        self.usuario_actual
                    )

                    self._commit_y_sync()

                    lbl_resultado.config(text=f"✅ ASIGNADO: {tipo_doc} N° {nuevo_num} / {anio}")
                    ent_expte.delete(0, tk.END)
                    limpiar_detalle()

                    nuevo_proximo = obtener_nuevo_numero(self.conn, tipo_doc)
                    lbl_proximo.config(text=f"  Próximo N°: {nuevo_proximo}  ")

                    for funcion in self.funciones_actualizar:
                        funcion()

                    return

                except sqlite3.IntegrityError:
                    # Otro usuario pudo haber tomado el mismo número.
                    self._safe_rollback()
                    if intento == intentos - 1:
                        messagebox.showerror(
                            "Colisión de numeración",
                            "Otra terminal asignó un número al mismo tiempo.\n\n"
                            "No se guardó el registro. Presione nuevamente 'Asignar N° y Guardar'."
                        )
                        return

                except sqlite3.OperationalError as e:
                    self._safe_rollback()
                    messagebox.showerror(
                        "Base ocupada o inaccesible",
                        f"No se pudo guardar porque la base está ocupada o no responde:\n\n{e}"
                    )
                    return

                except Exception as e:
                    self._safe_rollback()
                    messagebox.showerror("Error", f"Fallo al guardar:\n{e}")
                    return

        ttk.Button(top_frame, text=f"✔ Asignar N° y Guardar", command=guardar,
                   style="Accent.TButton").pack(pady=5)
        lbl_resultado.pack(pady=3)

        ttk.Separator(frame, orient="horizontal").pack(fill="x", pady=5, padx=20)

        # ── Grilla inferior ──────────────────────────────────
        bottom_frame = tk.Frame(frame)
        bottom_frame.pack(expand=True, fill="both", padx=10, pady=2)

        search_frame = tk.Frame(bottom_frame)
        search_frame.pack(fill="x", pady=3)

        tk.Label(search_frame, text="Filtrar:", font=("Segoe UI", 9)).pack(side="left")
        ent_busqueda_local = ttk.Entry(search_frame, width=25)
        ent_busqueda_local.pack(side="left", padx=5)

        btn_refrescar_local = ttk.Button(search_frame, text="🔄", width=3,
                                         command=lambda: actualizar_grilla_local())
        btn_refrescar_local.pack(side="left", padx=2)

        # 🌟 LÓGICA CONDICIONAL: Solo Oficios tienen Remitido
        if tipo_doc == "OFICIO":
            columnas = ("Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID")
            visibles = ("Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario")
        else:
            columnas = ("Número", "Expediente", "Detalle", "Mes", "Año", "Fecha", "Usuario", "ID")
            visibles = ("Número", "Expediente", "Detalle", "Mes", "Año", "Fecha", "Usuario")

        tree = ttk.Treeview(bottom_frame, columns=columnas, show="headings", height=10, displaycolumns=visibles)
        self._configurar_tags_treeview(tree, colores["fondo"])

        # Botones de acción alineados a la derecha
        btn_borrar = ttk.Button(search_frame, text="🗑️ Borrar", command=lambda: self.borrar_registro(tree))
        btn_borrar.pack(side="right", padx=2)
        if self.rol_actual != "admin":
            btn_borrar.state(['disabled'])

        btn_anular = ttk.Button(search_frame, text="🚫 Anular", command=lambda: self.anular_registro(tree))
        btn_anular.pack(side="right", padx=2)

        btn_modificar = ttk.Button(search_frame, text="✏️ Modificar", command=lambda: self.modificar_registro(tree))
        btn_modificar.pack(side="right", padx=2)

        # 🌟 El botón Remitido solo aparece en la pestaña Oficios
        if tipo_doc == "OFICIO":
            btn_remitido = ttk.Button(search_frame, text="📨 Remitido", command=lambda: self.toggle_remitido(tree))
            btn_remitido.pack(side="right", padx=2)

        tree.column("Número", width=65, anchor="center")
        tree.column("Expediente", width=110)
        tree.column("Detalle", width=340)
        if tipo_doc == "OFICIO":
            tree.column("Remitido", width=70, anchor="center")
        tree.column("Mes", width=80, anchor="center")
        tree.column("Año", width=45, anchor="center")
        tree.column("Fecha", width=120, anchor="center")
        tree.column("Usuario", width=100)
        tree.column("ID", width=35, anchor="center")

        for col in columnas:
            tree.heading(col, text=col)

        # Scrollbar
        scrollbar = ttk.Scrollbar(bottom_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        tree.pack(side="left", expand=True, fill="both")
        scrollbar.pack(side="right", fill="y")

        def actualizar_grilla_local(*args):
            for item in tree.get_children():
                tree.delete(item)
            termino = f"%{ent_busqueda_local.get().strip()}%"
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT id, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0)
                FROM registros
                WHERE tipo = ? AND (expediente LIKE ? OR detalle LIKE ? OR usuario LIKE ?)
                ORDER BY anio DESC, numero DESC, id DESC LIMIT 50
            """, (tipo_doc, termino, termino, termino))
            for fila in cursor.fetchall():
                id_reg, numero, anio, expte, detalle, usu, fecha, remitido = fila
                mes_num = fecha[5:7] if fecha else '01'
                mes_texto = DICCIONARIO_MESES.get(mes_num, "")
                remitido_txt = "✅" if remitido else "—"
                
                # 🌟 Adaptamos los valores según si es Oficio o no
                if tipo_doc == "OFICIO":
                    fila_ordenada = (numero, expte, detalle, remitido_txt, mes_texto, anio, fecha, usu, id_reg)
                else:
                    fila_ordenada = (numero, expte, detalle, mes_texto, anio, fecha, usu, id_reg)
                    
                tree.insert("", tk.END, values=fila_ordenada)
            self._aplicar_zebra(tree)

            nuevo_proximo = obtener_nuevo_numero(self.conn, tipo_doc)
            lbl_proximo.config(text=f"  Próximo N°: {nuevo_proximo}  ")

        ent_busqueda_local.bind("<KeyRelease>", actualizar_grilla_local)
        self.funciones_actualizar.append(actualizar_grilla_local)
        actualizar_grilla_local()

    # ──────────────────────────────────────────────────────────
    # PESTAÑA BUSCADOR GLOBAL
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_buscador(self):
        header = tk.Frame(self.tab_buscador, bg="#34495E", height=45)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="  🔍 Búsqueda General y Auditoría",
                 font=("Segoe UI", 14, "bold"), bg="#34495E", fg="white").pack(side="left", padx=10)

        # ── Filtros ──────────────────────────────────────────
        filtro_frame = tk.Frame(self.tab_buscador, bg="#ECF0F1", relief="groove", bd=1)
        filtro_frame.pack(fill="x", padx=10, pady=5)

        tk.Label(filtro_frame, text="Texto:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=0, padx=5, pady=5)
        ent_busqueda_global = ttk.Entry(filtro_frame, width=22)
        ent_busqueda_global.grid(row=0, column=1, padx=3, pady=5)

        tk.Label(filtro_frame, text="Desde:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=2, padx=5)
        if HAY_CALENDARIO:
            ent_fecha_desde = DateEntry(filtro_frame, width=11, date_pattern="dd/MM/yyyy",
                                       year=datetime.now().year, month=1, day=1,
                                       locale="es_AR", background="#34495E", foreground="white")
        else:
            ent_fecha_desde = ttk.Entry(filtro_frame, width=12)
            ent_fecha_desde.insert(0, f"01/01/{datetime.now().year}")
        ent_fecha_desde.grid(row=0, column=3, padx=3, pady=5)

        tk.Label(filtro_frame, text="Hasta:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=4, padx=5)
        if HAY_CALENDARIO:
            ent_fecha_hasta = DateEntry(filtro_frame, width=11, date_pattern="dd/MM/yyyy",
                                       locale="es_AR", background="#34495E", foreground="white")
        else:
            ent_fecha_hasta = ttk.Entry(filtro_frame, width=12)
            ent_fecha_hasta.insert(0, datetime.now().strftime("%d/%m/%Y"))
        ent_fecha_hasta.grid(row=0, column=5, padx=3, pady=5)

        tk.Label(filtro_frame, text="Tipo:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=6, padx=5)
        combo_tipo = ttk.Combobox(filtro_frame, width=18, state="readonly",
                                  values=["TODOS", "OFICIO", "AUTO", "SENTENCIA TRAMITE", "SENTENCIA RELATORIA"])
        combo_tipo.set("TODOS")
        combo_tipo.grid(row=0, column=7, padx=3, pady=5)

        var_solo_anulados = tk.BooleanVar(value=False)
        chk_anulados = tk.Checkbutton(
            filtro_frame,
            text="Sólo anulados",
            variable=var_solo_anulados,
            bg="#ECF0F1",
            font=("Segoe UI", 9, "bold"),
            fg="#B00000",
            command=lambda: actualizar_grilla_global()
        )
        chk_anulados.grid(row=0, column=8, padx=5, pady=5)

        btn_buscar = ttk.Button(filtro_frame, text="🔍 Buscar",
                                command=lambda: actualizar_grilla_global())
        btn_buscar.grid(row=0, column=9, padx=8, pady=5)

        def _obtener_fecha(widget, fallback_str):
            """Extrae fecha de DateEntry o Entry con validación."""
            try:
                if HAY_CALENDARIO and isinstance(widget, DateEntry):
                    return widget.get_date()
                else:
                    txt = widget.get().strip()
                    return datetime.strptime(txt, "%d/%m/%Y")
            except:
                return datetime.strptime(fallback_str, "%d/%m/%Y")

        # ── Barra de acciones ────────────────────────────────
        action_frame = tk.Frame(self.tab_buscador)
        action_frame.pack(fill="x", padx=10, pady=2)

        def exportar_a_excel():
            try:
                import pandas as pd
                cursor = self.conn.cursor()
                cursor.execute("SELECT id, tipo, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0) FROM registros ORDER BY tipo ASC, anio DESC, numero DESC")
                datos = cursor.fetchall()
                df = pd.DataFrame(datos, columns=["ID", "Tipo", "Número", "Año", "Expediente", "Detalle", "Usuario", "Fecha", "Remitido"])
                df['Fecha_Convertida'] = pd.to_datetime(df['Fecha'])
                dicc_meses = {1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
                              7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'}
                df['Mes'] = df['Fecha_Convertida'].dt.month.map(dicc_meses)
                df['Remitido'] = df['Remitido'].apply(lambda x: "SI" if x else "NO")
                df = df[["Tipo", "Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID"]]
                nombre_archivo = f"Auditoria_Numeradores_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                with pd.ExcelWriter(nombre_archivo, engine='openpyxl') as writer:
                    df.to_excel(writer, sheet_name="General", index=False)
                    df[df["Expediente"].astype(str).str.upper() == "ANULADO"].to_excel(writer, sheet_name="Anulados", index=False)
                    df[df["Tipo"] == "OFICIO"].to_excel(writer, sheet_name="Oficios", index=False)
                    df[df["Tipo"] == "AUTO"].to_excel(writer, sheet_name="Interlocutorios", index=False)
                    df[df["Tipo"] == "SENTENCIA TRAMITE"].to_excel(writer, sheet_name="Sent. Trámite", index=False)
                    df[df["Tipo"] == "SENTENCIA RELATORIA"].to_excel(writer, sheet_name="Sent. Relatoría", index=False)
                messagebox.showinfo("Éxito", f"¡Excel exportado con éxito!\n{nombre_archivo}")
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo exportar:\n{e}")

        ttk.Button(action_frame, text="📥 Exportar Excel", command=exportar_a_excel).pack(side="left", padx=3)

        btn_borrar = ttk.Button(action_frame, text="🗑️ Borrar", command=lambda: self.borrar_registro(tree))
        btn_borrar.pack(side="right", padx=2)
        if self.rol_actual != "admin":
            btn_borrar.state(['disabled'])

        ttk.Button(action_frame, text="🚫 Anular", command=lambda: self.anular_registro(tree)).pack(side="right", padx=2)
        ttk.Button(action_frame, text="✏️ Modificar", command=lambda: self.modificar_registro(tree)).pack(side="right", padx=2)
        ttk.Button(action_frame, text="📨 Remitido", command=lambda: self.toggle_remitido(tree)).pack(side="right", padx=2)

        # ── Grilla global ────────────────────────────────────
        tree_frame = tk.Frame(self.tab_buscador)
        tree_frame.pack(expand=True, fill="both", padx=10, pady=5)

        columnas = ("Tipo", "Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID")
        visibles = ("Tipo", "Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario")
        tree = ttk.Treeview(tree_frame, columns=columnas, show="headings", height=18, displaycolumns=visibles)
        self._configurar_tags_treeview(tree, "#F0F4F8")

        tree.column("Tipo", width=130)
        tree.column("Número", width=60, anchor="center")
        tree.column("Expediente", width=110)
        tree.column("Detalle", width=320)
        tree.column("Remitido", width=65, anchor="center")
        tree.column("Mes", width=80, anchor="center")
        tree.column("Año", width=45, anchor="center")
        tree.column("Fecha", width=120, anchor="center")
        tree.column("Usuario", width=100)
        tree.column("ID", width=35, anchor="center")
        for col in columnas:
            tree.heading(col, text=col)

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        tree.pack(side="left", expand=True, fill="both")
        scrollbar.pack(side="right", fill="y")

        # ── Barra de estado inferior ─────────────────────────
        lbl_conteo = tk.Label(self.tab_buscador, text="", font=("Segoe UI", 9), fg="#555", anchor="w")
        lbl_conteo.pack(fill="x", padx=15, pady=2)

        def actualizar_grilla_global(*args):
            for item in tree.get_children():
                tree.delete(item)
            termino_raw = ent_busqueda_global.get().strip()
            termino = f"%{termino_raw}%"
            tipo_filtro = combo_tipo.get()
            solo_anulados = var_solo_anulados.get()

            fecha_desde = _obtener_fecha(ent_fecha_desde, f"01/01/{datetime.now().year}").strftime("%Y-%m-%d 00:00:00")
            fecha_hasta = _obtener_fecha(ent_fecha_hasta, datetime.now().strftime("%d/%m/%Y")).strftime("%Y-%m-%d 23:59:59")

            cursor = self.conn.cursor()

            query = """
                SELECT id, tipo, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0)
                FROM registros
                WHERE fecha BETWEEN ? AND ?
            """
            params = [fecha_desde, fecha_hasta]

            if tipo_filtro != "TODOS":
                query += " AND tipo = ?"
                params.append(tipo_filtro)

            if solo_anulados:
                query += " AND expediente = 'ANULADO'"
            else:
                query += " AND (expediente LIKE ? OR detalle LIKE ? OR tipo LIKE ? OR usuario LIKE ?)"
                params.extend([termino, termino, termino, termino])

            query += " ORDER BY anio DESC, numero DESC, id DESC LIMIT 500"

            cursor.execute(query, params)

            filas = cursor.fetchall()
            for fila in filas:
                id_reg, tipo, numero, anio, expte, detalle, usu, fecha, remitido = fila
                mes_num = fecha[5:7] if fecha else '01'
                mes_texto = DICCIONARIO_MESES.get(mes_num, "")
                remitido_txt = "✅" if remitido else "—"
                fila_ordenada = (tipo, numero, expte, detalle, remitido_txt, mes_texto, anio, fecha, usu, id_reg)
                tree.insert("", tk.END, values=fila_ordenada)
            self._aplicar_zebra(tree)

            desde_txt = _obtener_fecha(ent_fecha_desde, f"01/01/{datetime.now().year}").strftime("%d/%m/%Y")
            hasta_txt = _obtener_fecha(ent_fecha_hasta, datetime.now().strftime("%d/%m/%Y")).strftime("%d/%m/%Y")
            modo_txt = " — SÓLO ANULADOS" if solo_anulados else ""
            lbl_conteo.config(text=f"Mostrando {len(filas)} registro(s){modo_txt} — Período: {desde_txt} a {hasta_txt}")

        ent_busqueda_global.bind("<KeyRelease>", actualizar_grilla_global)
        self.funciones_actualizar.append(actualizar_grilla_global)
        actualizar_grilla_global()

    # ──────────────────────────────────────────────────────────
    # PESTAÑA ESTADÍSTICAS
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_estadisticas(self):
        header = tk.Frame(self.tab_estadisticas, bg="#1ABC9C", height=45)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="  📊 Estadísticas y Resumen",
                 font=("Segoe UI", 14, "bold"), bg="#1ABC9C", fg="white").pack(side="left", padx=10)

        ttk.Button(header, text="🔄 Refrescar",
                   command=lambda: self.actualizar_estadisticas()).pack(side="right", padx=15, pady=8)

        contenido = tk.Frame(self.tab_estadisticas, bg="#FAFAFA")
        contenido.pack(expand=True, fill="both", padx=10, pady=5)

        # ── Resumen del año (tarjetas) ───────────────────────
        frame_resumen = tk.Frame(contenido, bg="#FAFAFA")
        frame_resumen.pack(fill="x", pady=5)

        tarjetas_frame = tk.Frame(frame_resumen, bg="#FAFAFA")
        tarjetas_frame.pack(fill="x")

        self.labels_stats = {}
        tipos_info = [
            ("OFICIO", "📝", "#3B7DD8"),
            ("AUTO", "⚖️", "#7B3DD8"),
            ("SENTENCIA TRAMITE", "📜", "#2DA86A"),
            ("SENTENCIA RELATORIA", "📜", "#D89B3B"),
        ]

        for i, (tipo, emoji, color) in enumerate(tipos_info):
            card = tk.Frame(tarjetas_frame, bg=color, padx=8, pady=4, relief="raised", bd=1)
            card.grid(row=0, column=i, padx=4, pady=2, sticky="nsew")
            tarjetas_frame.columnconfigure(i, weight=1)

            inner = tk.Frame(card, bg=color)
            inner.pack()
            tk.Label(inner, text=f"{emoji} {tipo.replace('SENTENCIA ', 'Sent. ')}",
                     font=("Segoe UI", 9, "bold"), bg=color, fg="white").pack(side="left", padx=3)
            lbl_num = tk.Label(inner, text="0", font=("Segoe UI", 14, "bold"), bg=color, fg="white")
            lbl_num.pack(side="left", padx=5)
            self.labels_stats[tipo] = lbl_num

        # ── Sub-notebook para Mensual / Ranking / Auditoría ──
        sub_notebook = ttk.Notebook(contenido)
        sub_notebook.pack(expand=True, fill="both", pady=5)

        tab_mensual = ttk.Frame(sub_notebook)
        tab_ranking = ttk.Frame(sub_notebook)
        tab_log = ttk.Frame(sub_notebook)

        sub_notebook.add(tab_mensual, text="  📅 Desglose Mensual  ")
        sub_notebook.add(tab_ranking, text="  🏆 Ranking  ")
        if self.rol_actual == "admin":
            sub_notebook.add(tab_log, text="  📋 Log de Auditoría  ")

        # ── Ranking de detalles más usados ───────────────────
        cols_rank = ("Pos", "Detalle", "Tipo", "Cantidad")
        self.tree_ranking = ttk.Treeview(tab_ranking, columns=cols_rank, show="headings", height=15)
        self.tree_ranking.column("Pos", width=40, anchor="center")
        self.tree_ranking.column("Detalle", width=350)
        self.tree_ranking.column("Tipo", width=150)
        self.tree_ranking.column("Cantidad", width=80, anchor="center")
        for col in cols_rank:
            self.tree_ranking.heading(col, text=col)

        self.tree_ranking.tag_configure("oro", background="#FFF3CD", font=("Segoe UI", 10, "bold"))
        self.tree_ranking.tag_configure("plata", background="#F0F0F0")
        self.tree_ranking.tag_configure("bronce", background="#FDEBD0")
        self.tree_ranking.tag_configure("normal_par", background="#FFFFFF")
        self.tree_ranking.tag_configure("normal_impar", background="#F8F9FA")

        scroll_rank = ttk.Scrollbar(tab_ranking, orient="vertical", command=self.tree_ranking.yview)
        self.tree_ranking.configure(yscrollcommand=scroll_rank.set)
        self.tree_ranking.pack(side="left", expand=True, fill="both")
        scroll_rank.pack(side="right", fill="y")

        # ── Desglose Mensual ─────────────────────────────────
        cols_mes = ("Mes", "Oficios", "Interlocutorios", "Sent. Trámite", "Sent. Relatoría", "Total")
        self.tree_mensual = ttk.Treeview(tab_mensual, columns=cols_mes, show="headings", height=13)

        self.tree_mensual.column("Mes", width=120)
        self.tree_mensual.column("Oficios", width=90, anchor="center")
        self.tree_mensual.column("Interlocutorios", width=110, anchor="center")
        self.tree_mensual.column("Sent. Trámite", width=110, anchor="center")
        self.tree_mensual.column("Sent. Relatoría", width=110, anchor="center")
        self.tree_mensual.column("Total", width=80, anchor="center")
        for col in cols_mes:
            self.tree_mensual.heading(col, text=col)

        self.tree_mensual.tag_configure("par", background="#E8F8F5")
        self.tree_mensual.tag_configure("impar", background="#FFFFFF")
        self.tree_mensual.tag_configure("total", background="#2C3E50", foreground="white",
                                        font=("Segoe UI", 10, "bold"))

        self.tree_mensual.pack(expand=True, fill="both")

        # ── Log de Auditoría (ahora con scroll y en su propia pestaña) ──
        cols_log = ("Fecha", "Acción", "Registro", "Detalle", "Usuario", "PC")
        self.tree_log = ttk.Treeview(tab_log, columns=cols_log, show="headings", height=15)
        self.tree_log.column("Fecha", width=140)
        self.tree_log.column("Acción", width=130)
        self.tree_log.column("Registro", width=80, anchor="center")
        self.tree_log.column("Detalle", width=350)
        self.tree_log.column("Usuario", width=130)
        self.tree_log.column("PC", width=120)
        for col in cols_log:
            self.tree_log.heading(col, text=col)

        scroll_log = ttk.Scrollbar(tab_log, orient="vertical", command=self.tree_log.yview)
        self.tree_log.configure(yscrollcommand=scroll_log.set)
        self.tree_log.pack(side="left", expand=True, fill="both")
        scroll_log.pack(side="right", fill="y")

        self.funciones_actualizar.append(self.actualizar_estadisticas)
        self.actualizar_estadisticas()

    def actualizar_estadisticas(self):
        anio = datetime.now().year
        cursor = self.conn.cursor()

        # 1. PRÓXIMO CORRELATIVO POR TIPO (Tarjetas superiores)
        # IMPORTANTE:
        # - COUNT(*) cuenta registros existentes.
        # - MAX(numero) respeta el último número realmente usado.
        # - MAX(numero) + 1 muestra "por dónde vamos".
        #
        # Ej.: si el próximo oficio es 802, la tarjeta debe mostrar 802,
        # aunque en la base existan menos registros por anulaciones o borrados físicos.
        cursor.execute("""
            SELECT tipo, COALESCE(MAX(numero), 0) + 1
            FROM registros
            WHERE anio = ?
            GROUP BY tipo
        """, (anio,))

        proximos = {fila[0]: fila[1] for fila in cursor.fetchall()}

        for tipo, lbl in self.labels_stats.items():
            lbl.config(text=str(proximos.get(tipo, 1)))

        # 2. DESGLOSE MENSUAL
        for item in self.tree_mensual.get_children():
            self.tree_mensual.delete(item)

        # 2. DESGLOSE MENSUAL POR CORRELATIVOS EMITIDOS
        #
        # No usamos COUNT(*) porque cuenta filas existentes.
        # La estadística mensual debe reflejar cuántos números salieron
        # según el avance real del correlativo.
        #
        # Criterio:
        # cantidad del mes = máximo número usado hasta ese mes
        #                    - máximo número usado hasta el mes anterior.
        cursor.execute("""
            WITH base AS (
                SELECT
                    CASE
                        WHEN fecha LIKE '____-__-__%' THEN substr(fecha, 6, 2)
                        WHEN fecha LIKE '____/__/__%' THEN substr(fecha, 6, 2)
                        WHEN fecha LIKE '__/__/____%' THEN substr(fecha, 4, 2)
                        WHEN fecha LIKE '__-__-____%' THEN substr(fecha, 4, 2)
                        ELSE '00'
                    END AS mes_calc,
                    tipo,
                    numero
                FROM registros
                WHERE anio = ?
            )
            SELECT mes_calc, tipo, MAX(numero)
            FROM base
            WHERE mes_calc BETWEEN '01' AND '12'
            GROUP BY mes_calc, tipo
        """, (anio,))
        
        maximos_por_mes = {}

        for mes, tipo, max_num in cursor.fetchall():
            mes = str(mes or "00").strip()
            if mes not in maximos_por_mes:
                maximos_por_mes[mes] = {}
            maximos_por_mes[mes][tipo] = max_num or 0

        meses_nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        gran_total = [0, 0, 0, 0]
        columnas = ["OFICIO", "AUTO", "SENTENCIA TRAMITE", "SENTENCIA RELATORIA"]

        ultimo_max_por_tipo = {tipo: 0 for tipo in columnas}

        for m_idx, mes_nombre in enumerate(meses_nombres, start=1):
            mes_str = f"{m_idx:02d}"
            conteos = []

            for t_idx, tipo_col in enumerate(columnas):
                max_mes = maximos_por_mes.get(mes_str, {}).get(tipo_col, 0)

                if max_mes > ultimo_max_por_tipo[tipo_col]:
                    cantidad_mes = max_mes - ultimo_max_por_tipo[tipo_col]
                    ultimo_max_por_tipo[tipo_col] = max_mes
                else:
                    cantidad_mes = 0

                conteos.append(cantidad_mes)
                gran_total[t_idx] += cantidad_mes

            total_mes = sum(conteos)
            tag = "par" if m_idx % 2 == 0 else "impar"
            self.tree_mensual.insert("", tk.END,
                                     values=(mes_nombre, conteos[0], conteos[1], conteos[2], conteos[3], total_mes),
                                     tags=(tag,))

        # Fila TOTAL: total de correlativos emitidos durante el año.
        self.tree_mensual.insert("", tk.END,
                                 values=("TOTAL", gran_total[0], gran_total[1], gran_total[2], gran_total[3],
                                         sum(gran_total)),
                                 tags=("total",))

        # 3. LOG DE AUDITORIA
        for item in self.tree_log.get_children():
            self.tree_log.delete(item)
        cursor.execute("""
            SELECT fecha,
                   accion,
                   registro_id,
                   campo_modificado || ': ' || COALESCE(valor_anterior,'') || ' → ' || COALESCE(valor_nuevo,''),
                   usuario,
                   COALESCE(pc_name, '')
            FROM log_auditoria
            ORDER BY id DESC
            LIMIT 100
        """)
        for fila in cursor.fetchall():
            self.tree_log.insert("", tk.END, values=fila)
            
        # 4. RANKING
        for item in self.tree_ranking.get_children():
            self.tree_ranking.delete(item)
        cursor.execute("""
            SELECT detalle, tipo, COUNT(*) as cantidad
            FROM registros
            WHERE anio = ? AND expediente != 'ANULADO' AND detalle != ''
            GROUP BY detalle, tipo
            ORDER BY cantidad DESC
            LIMIT 30
        """, (anio,))
        for pos, fila in enumerate(cursor.fetchall(), start=1):
            detalle, tipo, cantidad = fila
            medalla = "🥇" if pos == 1 else "🥈" if pos == 2 else "🥉" if pos == 3 else ""
            tag = "oro" if pos == 1 else "plata" if pos == 2 else "bronce" if pos == 3 else "normal_par" if pos % 2 == 0 else "normal_impar"
            self.tree_ranking.insert("", tk.END,
                                     values=(f"{medalla} {pos}".strip(), detalle, tipo, cantidad),
                                     tags=(tag,))
# ══════════════════════════════════════════════════════════
    # 📅 PESTAÑA AGENDA — estilo Lex-Doctor con mini-calendarios
    # ══════════════════════════════════════════════════════════
    def construir_pestaña_agenda(self):
        colores = COLORES_PESTANAS["AGENDA"]
        bg_grilla = "#D4D0C8"  # gris clásico Lex-Doctor

        # Estado interno de la pestaña
        self.agenda_fecha_sel = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        self.agenda_mes_centro = datetime(datetime.now().year, datetime.now().month, 1)
        self.agenda_solo_pendientes = tk.BooleanVar(value=False)

        # ⚡ Evita redibujar tres calendarios en cada click rápido de ◀ ▶
        self._agenda_nav_after_id = None

        # ── Header rojo ──────────────────────────────────────
        header = tk.Frame(self.tab_agenda, bg=colores["acento"], height=42)
        header.pack(fill="x")
        header.pack_propagate(False)

        tk.Label(
            header,
            text="  📅 AGENDA",
            font=("Segoe UI", 14, "bold"),
            bg=colores["acento"],
            fg="white"
        ).pack(side="left", padx=10)

        # Botón principal de carga: más visible y menos tosco que en la toolbar gris
        tk.Button(
            header,
            text="➕ Nueva audiencia",
            command=self.agenda_modal_carga,
            bg="#F7F7F7",
            fg="#222222",
            activebackground="#FFFFFF",
            activeforeground="#000000",
            font=("Segoe UI", 10, "bold"),
            relief="raised",
            bd=1,
            padx=12,
            pady=3,
            cursor="hand2"
        ).pack(side="right", padx=12, pady=6)

        # ── Toolbar tipo Lex-Doctor (botones grandes con texto) ──
        toolbar = tk.Frame(self.tab_agenda, bg=bg_grilla, relief="raised", bd=1)
        toolbar.pack(fill="x")

        def _btn_tool(master, txt, cmd, side="left"):
            b = tk.Button(master, text=txt, command=cmd,
                          bg=bg_grilla, fg="black", relief="raised", bd=1,
                          font=("Segoe UI", 8), width=11, height=2, justify="center",
                          cursor="hand2")
            b.pack(side=side, padx=1, pady=2)
            return b

        # "Agregar" se removió de la toolbar gris:
        # ahora está como botón principal en el encabezado rojo.
        _btn_tool(toolbar, "🗑️\nElimina (F3)", lambda: self.agenda_borrar())
        _btn_tool(toolbar, "✏️\nModifica (F4)", lambda: self.agenda_modal_modificar())
        _btn_tool(toolbar, "✅\nRealizada", lambda: self.agenda_cambiar_estado("Realizada"))
        _btn_tool(toolbar, "❌\nFracasada", lambda: self.agenda_reprogramar_workflow("Fracasada"))
        _btn_tool(toolbar, "⏸\nSuspendida", lambda: self.agenda_reprogramar_workflow("Suspendida"))
        _btn_tool(toolbar, "🔁\nReprog.", lambda: self.agenda_reprogramar_directa())
        _btn_tool(toolbar, "📋\nCopiar fecha", lambda: self._agenda_copiar_fecha())
        _btn_tool(toolbar, "📝\nDecreto", lambda: self._agenda_copiar_decreto())
        _btn_tool(toolbar, "➕📅\nSumar días", lambda: self._agenda_modal_plazos())
        _btn_tool(toolbar, "🔔\nAvisos", lambda: self.verificar_alertas_agenda(manual=True))
        _btn_tool(toolbar, "📥\nListado", lambda: self.agenda_exportar_excel(), side="right")
        _btn_tool(toolbar, "🏠\nHoy (F8)", lambda: self._agenda_ir_a_hoy(), side="right")

        # ── Contenedor de mini-calendarios ───────────────────
        cal_outer = tk.Frame(self.tab_agenda, bg=colores["fondo"])
        cal_outer.pack(fill="x", padx=8, pady=4)

        tk.Button(cal_outer, text="◀", font=("Segoe UI", 12, "bold"),
                  bg=colores["fondo"], fg=colores["titulo"], relief="flat",
                  cursor="hand2", command=lambda: self._agenda_navegar_mes(-1)
                  ).pack(side="left", padx=2)

        self.agenda_minical_frame = tk.Frame(cal_outer, bg=colores["fondo"])
        self.agenda_minical_frame.pack(side="left", expand=True)

        tk.Button(cal_outer, text="▶", font=("Segoe UI", 12, "bold"),
                  bg=colores["fondo"], fg=colores["titulo"], relief="flat",
                  cursor="hand2", command=lambda: self._agenda_navegar_mes(1)
                  ).pack(side="right", padx=2)

        # ── Línea: feriado + filtros (responsable + buscador) ──
        info_frame = tk.Frame(self.tab_agenda, bg=colores["fondo"])
        info_frame.pack(fill="x", padx=10, pady=2)

        self.agenda_lbl_feriado = tk.Label(info_frame, text="",
                                            font=("Segoe UI", 10, "italic", "bold"),
                                            fg=colores["acento"], bg=colores["fondo"])
        self.agenda_lbl_feriado.pack(side="left", padx=5)

        # Combo responsable a la derecha
        cur = self.conn.cursor()
        cur.execute("SELECT nombre FROM usuarios ORDER BY nombre")
        nombres_usr = [f[0] for f in cur.fetchall()]
        self.agenda_filtro_resp = ttk.Combobox(info_frame, width=24, state="readonly",
                                                values=["Todos los miembros"] + nombres_usr)
        self.agenda_filtro_resp.set("Todos los miembros")
        self.agenda_filtro_resp.pack(side="right", padx=5)
        self.agenda_filtro_resp.bind("<<ComboboxSelected>>",
                                     lambda e: self.agenda_actualizar_grilla())

        tk.Label(info_frame, text="🔍", bg=colores["fondo"]).pack(side="right", padx=2)
        self.agenda_busq = ttk.Entry(info_frame, width=18)
        self.agenda_busq.pack(side="right", padx=3)
        self.agenda_busq.bind("<KeyRelease>", lambda e: self.agenda_actualizar_grilla())

        # ── Grilla de eventos del día seleccionado ───────────
        grid_frame = tk.Frame(self.tab_agenda)
        grid_frame.pack(expand=True, fill="both", padx=10, pady=5)

        columnas = ("Hecho", "Responsable", "Tipo", "Hora", "Descripción", "ID")
        visibles = ("Hecho", "Responsable", "Tipo", "Hora", "Descripción")
        self.agenda_tree = ttk.Treeview(grid_frame, columns=columnas, show="headings",
                                        height=14, displaycolumns=visibles)

        self.agenda_tree.column("Hecho", width=45, anchor="center", stretch=False)
        self.agenda_tree.column("Responsable", width=125, stretch=False)
        self.agenda_tree.column("Tipo", width=95, anchor="center", stretch=False)
        self.agenda_tree.column("Hora", width=60, anchor="center", stretch=False)

        # Más ancho real para poder leer descripciones largas.
        # Se habilita scroll horizontal debajo.
        self.agenda_tree.column("Descripción", width=950, stretch=False)

        for col in columnas:
            self.agenda_tree.heading(col, text=col)

        # Encabezados más claros
        self.agenda_tree.heading("Hecho", text="")
        self.agenda_tree.heading("Tipo", text="Clase")

        # Tags estilo Lex-Doctor
        self.agenda_tree.tag_configure(
            "preso",
            background="#C0392B",
            foreground="white",
            font=("Segoe UI", 9, "bold")
        )

        self.agenda_tree.tag_configure(
            "realizada",
            foreground="#1E7A4D",
            font=("Segoe UI", 9, "normal")
        )

        self.agenda_tree.tag_configure(
            "fracasada",
            background="#FADBD8",
            foreground="#922B21",
            font=("Segoe UI", 9, "normal")
        )

        self.agenda_tree.tag_configure(
            "suspendida",
            background="#FCF3CF",
            foreground="#5A4A00",
            font=("Segoe UI", 9, "normal")
        )

        self.agenda_tree.tag_configure(
            "audiencia",
            foreground=colores["acento"],
            font=("Segoe UI", 9, "normal")
        )

        self.agenda_tree.tag_configure(
            "normal",
            background="#FFFFFF",
            font=("Segoe UI", 9, "normal")
        )

        scroll_y = ttk.Scrollbar(grid_frame, orient="vertical", command=self.agenda_tree.yview)
        scroll_x = ttk.Scrollbar(grid_frame, orient="horizontal", command=self.agenda_tree.xview)

        self.agenda_tree.configure(
            yscrollcommand=scroll_y.set,
            xscrollcommand=scroll_x.set
        )

        self.agenda_tree.pack(side="top", expand=True, fill="both")
        scroll_x.pack(side="bottom", fill="x")
        scroll_y.pack(side="right", fill="y")

        self.agenda_tree.bind("<Double-1>", lambda e: self.agenda_modal_modificar())

        # F-keys (sólo activas cuando esta pestaña está al frente)
        def _en_agenda():
            try:
                return "Agenda" in self.notebook.tab(self.notebook.select(), "text")
            except Exception:
                return False
        self.tab_agenda.bind_all("<F2>", lambda e: self.agenda_modal_carga() if _en_agenda() else None)
        self.tab_agenda.bind_all("<F3>", lambda e: self.agenda_borrar() if _en_agenda() else None)
        self.tab_agenda.bind_all("<F4>", lambda e: self.agenda_modal_modificar() if _en_agenda() else None)
        self.tab_agenda.bind_all("<F8>", lambda e: self._agenda_ir_a_hoy() if _en_agenda() else None)

        # ── Tabs inferiores Todo / Pendiente ─────────────────
        bottom = tk.Frame(self.tab_agenda, bg=bg_grilla, relief="sunken", bd=1)
        bottom.pack(fill="x", padx=0, pady=0)

        self._agenda_btn_todo = tk.Button(bottom, text="Todo", relief="sunken", bd=1,
                                          bg="white", font=("Segoe UI", 9), width=10,
                                          command=lambda: self._agenda_set_estado_filtro(False))
        self._agenda_btn_todo.pack(side="left", padx=2, pady=2)

        self._agenda_btn_pend = tk.Button(bottom, text="Pendiente", relief="raised", bd=1,
                                          bg=bg_grilla, font=("Segoe UI", 9), width=10,
                                          command=lambda: self._agenda_set_estado_filtro(True))
        self._agenda_btn_pend.pack(side="left", padx=2, pady=2)

        self.agenda_lbl_conteo = tk.Label(bottom, text="", bg=bg_grilla,
                                          font=("Segoe UI", 9), fg="#222")
        self.agenda_lbl_conteo.pack(side="right", padx=10)

        # Registro para refresh global desde otras partes
        self.funciones_actualizar.append(self._agenda_refresh_completo)

        # Render inicial
        self._agenda_construir_minicalendarios()
        self.agenda_actualizar_grilla()
        self._agenda_actualizar_label_feriado()

    # ──────────────────────────────────────────────────────────
    # NAVEGACIÓN Y ESTADO
    # ──────────────────────────────────────────────────────────
    def _agenda_set_estado_filtro(self, solo_pendientes):
        self.agenda_solo_pendientes.set(solo_pendientes)
        if solo_pendientes:
            self._agenda_btn_pend.config(relief="sunken", bg="white")
            self._agenda_btn_todo.config(relief="raised", bg="#D4D0C8")
        else:
            self._agenda_btn_todo.config(relief="sunken", bg="white")
            self._agenda_btn_pend.config(relief="raised", bg="#D4D0C8")
        self.agenda_actualizar_grilla()


    def _agenda_ir_a_hoy(self):
        self.agenda_fecha_sel = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        self.agenda_mes_centro = datetime(datetime.now().year, datetime.now().month, 1)
        self._agenda_construir_minicalendarios()
        self.agenda_actualizar_grilla()
        self._agenda_actualizar_label_feriado()

    def _agenda_refresh_completo(self):
        """Refresco completo: se usa cuando se agrega/borra/modifica un evento
        o un feriado. Reconstruye los calendarios para reflejar asteriscos nuevos."""
        if hasattr(self, "agenda_tree"):
            self._agenda_construir_minicalendarios()
            self.agenda_actualizar_grilla()
            self._agenda_actualizar_label_feriado()

    # ──────────────────────────────────────────────────────────
    # MINI-CALENDARIOS (3 meses)
    # ──────────────────────────────────────────────────────────
    def _agenda_dias_con_eventos(self, year, month):
        """
        Compatibilidad: devuelve días con eventos de un solo mes.
        Se mantiene por si alguna parte vieja del código la usa.
        """
        cursor = self.conn.cursor()
        inicio = f"{year:04d}-{month:02d}-01"

        if month == 12:
            fin = f"{year + 1:04d}-01-01"
        else:
            fin = f"{year:04d}-{month + 1:02d}-01"

        cursor.execute("""
            SELECT DISTINCT fecha
            FROM agenda
            WHERE fecha >= ? AND fecha < ?
        """, (inicio, fin))

        return {f[0] for f in cursor.fetchall()}


    def _agenda_dias_con_eventos_rango(self, meses_visibles):
        """
        Devuelve todos los días con eventos para los tres mini-calendarios visibles,
        usando UNA sola consulta a la base.
        """
        if not meses_visibles:
            return set()

        y_ini, m_ini = meses_visibles[0]
        y_fin, m_fin = meses_visibles[-1]

        inicio = f"{y_ini:04d}-{m_ini:02d}-01"

        if m_fin == 12:
            fin = f"{y_fin + 1:04d}-01-01"
        else:
            fin = f"{y_fin:04d}-{m_fin + 1:02d}-01"

        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT DISTINCT fecha
            FROM agenda
            WHERE fecha >= ? AND fecha < ?
        """, (inicio, fin))

        return {f[0] for f in cursor.fetchall()}

    def _agenda_navegar_mes(self, delta):
        c = self.agenda_mes_centro
        m = c.month + delta
        y = c.year

        while m < 1:
            m += 12
            y -= 1

        while m > 12:
            m -= 12
            y += 1

        self.agenda_mes_centro = datetime(y, m, 1)

        # ⚡ Debounce: si el usuario toca varias veces rápido,
        # se cancela el redibujado anterior y se ejecuta solo el último.
        try:
            if self._agenda_nav_after_id is not None:
                self.root.after_cancel(self._agenda_nav_after_id)
        except Exception:
            pass

        self._agenda_nav_after_id = self.root.after(
            40,
            self._agenda_construir_minicalendarios
        )

    def _agenda_seleccionar_dia(self, fecha_obj):
        """
        Selecciona un día en el mini-calendario.
        En modo Canvas se redibuja el bloque de 3 meses, lo que resulta más liviano
        que repintar Labels individuales.
        """
        self.agenda_fecha_sel = fecha_obj.replace(hour=0, minute=0, second=0, microsecond=0)
        nueva = self.agenda_fecha_sel.date()

        meses_visibles = self._agenda_meses_visibles()

        if (nueva.year, nueva.month) not in meses_visibles:
            self.agenda_mes_centro = datetime(nueva.year, nueva.month, 1)

        self._agenda_construir_minicalendarios()
        self.agenda_actualizar_grilla()
        self._agenda_actualizar_label_feriado()

    def _agenda_meses_visibles(self):
        """Devuelve los 3 (year, month) actualmente dibujados."""
        c = self.agenda_mes_centro
        result = []
        for delta in [-1, 0, 1]:
            m = c.month + delta
            y = c.year
            while m < 1:
                m += 12; y -= 1
            while m > 12:
                m -= 12; y += 1
            result.append((y, m))
        return result

    def _agenda_construir_minicalendarios(self):
        """
        Construye los 3 mini-calendarios usando Canvas.
        Más rápido que crear una grilla de Labels por cada mes.
        """
        for w in self.agenda_minical_frame.winfo_children():
            w.destroy()

        meses_visibles = self._agenda_meses_visibles()
        dias_eventos_global = self._agenda_dias_con_eventos_rango(meses_visibles)

        # Cache del rango visible, útil para redibujos sin ir a la base
        self._agenda_dias_eventos_visibles = dias_eventos_global

        for i, (y, m) in enumerate(meses_visibles):
            canvas = tk.Canvas(
                self.agenda_minical_frame,
                width=212,
                height=152,
                bg="#D4D0C8",
                highlightthickness=1,
                highlightbackground="#999",
                bd=0,
                cursor="arrow"
            )
            canvas.grid(row=0, column=i, padx=6, pady=0)

            self._agenda_dibujar_mini_mes(canvas, y, m, dias_eventos_global)

    def _agenda_dibujar_mini_mes(self, canvas, year, month, dias_eventos):
        """
        Dibuja un mini-calendario completo en Canvas.
        Versión visual pulida: mes arriba, puntito para eventos y mejor contraste.
        """
        canvas.delete("all")

        dias_abrev = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

        # Medidas del mini-calendario
        x0 = 15
        y_titulo = 12
        y0 = 32
        cell_w = 26
        cell_h = 16

        ancho_total = cell_w * 7
        centro_x = x0 + ancho_total / 2

        fuente_titulo = ("Segoe UI", 8, "bold")
        fuente_header = ("Segoe UI", 7, "bold")
        fuente_normal = ("Segoe UI", 8, "normal")
        fuente_bold = ("Segoe UI", 8, "bold")

        # Fondo general del calendario
        canvas.create_rectangle(
            3, 3, 209, 149,
            fill="#F7F3EA",
            outline="#B8B1A4"
        )

        # Título del mes arriba
        canvas.create_text(
            centro_x,
            y_titulo,
            text=f"{NOMBRES_MESES_ES[month].upper()} {year}",
            fill="#333333",
            font=fuente_titulo
        )

        # Línea divisoria suave bajo el título
        canvas.create_line(
            12, 24, 200, 24,
            fill="#C9C1B5"
        )

        # Encabezado: dom, lun, mar...
        for col, nombre_dia in enumerate(dias_abrev):
            x1 = x0 + col * cell_w
            y1 = y0
            x2 = x1 + cell_w
            y2 = y1 + cell_h

            canvas.create_rectangle(
                x1, y1, x2, y2,
                fill="#D9D2C6",
                outline="#B8B1A4"
            )

            canvas.create_text(
                x1 + cell_w / 2,
                y1 + cell_h / 2,
                text=nombre_dia,
                fill="#2C2C2C",
                font=fuente_header
            )

        cal = calendar.Calendar(firstweekday=6)
        semanas = cal.monthdayscalendar(year, month)

        # Tamaño fijo: siempre 6 filas de semanas
        while len(semanas) < 6:
            semanas.append([0, 0, 0, 0, 0, 0, 0])

        semanas = semanas[:6]

        hoy = datetime.now().date()
        fecha_sel = self.agenda_fecha_sel.date()

        for r, semana in enumerate(semanas, start=1):
            for c, dia in enumerate(semana):
                x1 = x0 + c * cell_w
                y1 = y0 + r * cell_h
                x2 = x1 + cell_w
                y2 = y1 + cell_h

                if dia == 0:
                    canvas.create_rectangle(
                        x1, y1, x2, y2,
                        fill="#ECE6DA",
                        outline="#C9C1B5"
                    )
                    continue

                f = datetime(year, month, dia)
                f_date = f.date()
                f_str = f"{year:04d}-{month:02d}-{dia:02d}"

                tiene_eventos = f_str in dias_eventos
                es_hoy = f_date == hoy
                es_seleccionado = f_date == fecha_sel
                es_finde = f.weekday() >= 5

                ok, _ = es_dia_habil(f)
                es_feriado_real = (not ok) and (not es_finde)

                tag_dia = f"dia_{year}_{month}_{dia}"

                # Colores base
                bg = "#FFFFFF"
                fg = "#222222"
                outline = "#C9C1B5"
                fuente = fuente_normal

                if es_finde or es_feriado_real:
                    fg = "#B03A2E"

                # Días con eventos: solo asterisco, sin fondo especial.
                if tiene_eventos:
                    if not (es_finde or es_feriado_real):
                        fg = "#1F4E79"

                if es_seleccionado:
                    bg = "#FFF1A8"
                    outline = "#D6A900"
                    fuente = fuente_bold

                if es_hoy:
                    bg = "#C0392B"
                    fg = "white"
                    outline = "#8E241B"
                    fuente = fuente_bold

                # Si hoy además está seleccionado, le agregamos borde amarillo fuerte
                if es_hoy and es_seleccionado:
                    outline = "#FFD54A"

                # Celda
                canvas.create_rectangle(
                    x1, y1, x2, y2,
                    fill=bg,
                    outline=outline,
                    width=2 if (es_hoy or es_seleccionado) else 1,
                    tags=(tag_dia,)
                )

                # Número del día, sin asterisco
                canvas.create_text(
                    x1 + cell_w / 2,
                    y1 + 7,
                    text=str(dia),
                    fill=fg,
                    font=fuente,
                    tags=(tag_dia,)
                )

                # Asterisco estilo Lex Doctor: pequeño, sobrio, arriba a la izquierda
                if tiene_eventos:
                    star_color = "white" if es_hoy else "black"
                    canvas.create_text(
                        x1 + 5,
                        y1 + 5,
                        text="*",
                        fill=star_color,
                        font=("Segoe UI", 7, "bold"),
                        tags=(tag_dia,)
                    )

                canvas.tag_bind(
                    tag_dia,
                    "<Button-1>",
                    lambda e, d=f: self._agenda_seleccionar_dia(d)
                )

                canvas.tag_bind(
                    tag_dia,
                    "<Enter>",
                    lambda e, cv=canvas: cv.config(cursor="hand2")
                )

                canvas.tag_bind(
                    tag_dia,
                    "<Leave>",
                    lambda e, cv=canvas: cv.config(cursor="arrow")
                )
    def _agenda_aplicar_estilo_celda(self, lbl, year, month, dia, tiene_eventos):
        """Aplica colores y texto a una celda existente."""
        f = datetime(year, month, dia)
        hoy = datetime.now().date()
        fecha_sel = self.agenda_fecha_sel.date()

        es_hoy = (f.date() == hoy)
        es_seleccionado = (f.date() == fecha_sel)
        es_finde = (f.weekday() >= 5)
        ok, _ = es_dia_habil(f)
        es_feriado_real = (not ok) and (not es_finde)

        texto = ("*" if tiene_eventos else " ") + f"{dia:>2}"

        if es_finde or es_feriado_real:
            fg = "#C0392B"
        else:
            fg = "black"

        if es_hoy:
            bg = "#C0392B"; fg = "white"
        elif es_seleccionado:
            bg = "#FFE066"
        else:
            bg = "#FFFFFF"

        peso = "bold" if (tiene_eventos or es_hoy or es_seleccionado) else "normal"

        lbl.config(text=texto, bg=bg, fg=fg, font=("Segoe UI", 8, peso))

    def _agenda_repintar_celda(self, fecha_date):
        """Recolorea una celda específica sin tocar el resto."""
        if not hasattr(self, "_agenda_celdas"):
            return
        clave = (fecha_date.year, fecha_date.month, fecha_date.day)
        lbl = self._agenda_celdas.get(clave)
        if not lbl:
            return
        # Necesitamos saber si tiene eventos: una sola query rápida
        cur = self.conn.cursor()
        f_str = fecha_date.strftime("%Y-%m-%d")
        cur.execute("SELECT 1 FROM agenda WHERE fecha=? LIMIT 1", (f_str,))
        tiene_eventos = cur.fetchone() is not None
        self._agenda_aplicar_estilo_celda(lbl, fecha_date.year, fecha_date.month,
                                           fecha_date.day, tiene_eventos)

    def _agenda_actualizar_label_feriado(self):
        f = self.agenda_fecha_sel
        nombre = FERIADOS_FIJOS.get((f.month, f.day))
        if nombre:
            self.agenda_lbl_feriado.config(text=nombre, fg="#C0392B")
            return
        ok, motivo = es_dia_habil(f)
        if not ok:
            self.agenda_lbl_feriado.config(text=motivo, fg="#C0392B")
            return
        # Día hábil normal: nombre del día + fecha
        dias_es = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        self.agenda_lbl_feriado.config(
            text=f"{dias_es[f.weekday()].capitalize()} {f.day} de {NOMBRES_MESES_ES[f.month]} de {f.year}",
            fg="#555"
        )

    # ──────────────────────────────────────────────────────────
    # GRILLA: solo el día seleccionado
    # ──────────────────────────────────────────────────────────
    def _agenda_abreviar_tipo(self, tipo):
        abrevs = {
            "Lectura / Firma de Sentencia": "Sent.",
            "Audiencia de Debate": "Debate",
            "Audiencia Preliminar": "Prelim.",
            "Nueva Audiencia Preliminar": "Nva. Prelim.",
            "Audiencia de Visu": "Visu",
            "Audiencia de Conciliación": "Conc.",

            "Cita Damnificada": "Cit. Dam.",
            "Cita Damnificada/Probation": "Dam. SJP",
            "Cita Damnificada/Mediación": "Dam. Med.",
            "Cita Damnificada/Conciliación": "Dam. Conc.",
            "Cita Imputado": "Cit. Imp.",
            "Cita Imputado/Reglas de Conducta": "Reglas",
            "Admisión de Pruebas": "Adm. Prueba",

            # Compatibilidad con registros viejos
            "Juicio Abreviado (firma)": "Abrev.",
            "Audiencia de Probation": "SJP",
            "Audiencia de Mediación": "Med.",
            "Declaración Testimonial": "Test.",
            "Citación a Imputado": "Cit. Imp.",
            "Citación a Víctima": "Cit. Víct.",

            # Internos
            "Vencimiento de Plazo": "Vto.",
            "Trámite / Otro": "Tarea",
        }
        return abrevs.get(tipo, tipo[:12])

    def agenda_actualizar_grilla(self, *args):
        if not hasattr(self, "agenda_tree"):
            return
        for item in self.agenda_tree.get_children():
            self.agenda_tree.delete(item)

        fecha_str = self.agenda_fecha_sel.strftime("%Y-%m-%d")
        termino = f"%{self.agenda_busq.get().strip()}%"
        f_resp = self.agenda_filtro_resp.get()
        solo_pend = self.agenda_solo_pendientes.get()

        sql = """
            SELECT id, estado, fecha, hora, tipo, expediente, descripcion,
                   anotacion, usuario_carga, detenido
            FROM agenda
            WHERE fecha = ?
              AND (expediente LIKE ? OR descripcion LIKE ? OR tipo LIKE ? OR anotacion LIKE ?)
        """
        params = [fecha_str, termino, termino, termino, termino]

        if solo_pend:
            sql += " AND estado = 'Pendiente'"
        if f_resp != "Todos los miembros":
            sql += " AND usuario_carga = ?"
            params.append(f_resp)

        sql += " ORDER BY hora ASC, id ASC"

        cursor = self.conn.cursor()
        cursor.execute(sql, params)
        filas = cursor.fetchall()

        for fila in filas:
            id_reg, estado, fecha, hora, tipo, expte, desc, anotacion, usuario, detenido = fila

            # Símbolo "Hecho": vacío pendiente, ✓ realizada, ✗ fracasada, ⏸ suspendida
            he_letra = {"Pendiente": "", "Realizada": "✓",
                        "Fracasada": "✗", "Suspendida": "⏸"}.get(estado, "")

            tipo_abrev = self._agenda_abreviar_tipo(tipo)

            expte_txt = f"Expte. Nº {str(expte).upper()}" if expte else "Sin expediente"

            if tipo == "Vencimiento de Plazo":
                desc_completa = expte_txt
                if desc:
                    desc_completa += f" — {desc}"
            else:
                desc_completa = f"{expte_txt} — {tipo}"
                if desc:
                    desc_completa += f" — {desc}"

            if anotacion:
                desc_completa += f" — 【{str(anotacion).strip().upper()}】"

            if detenido and estado == "Pendiente":
                desc_completa = "🚨 PRESO — " + desc_completa

            # Sufijo del estado actual al final de la descripción
            if estado == "Realizada":
                desc_completa += "  ✓ REALIZADA"
            elif estado == "Fracasada":
                desc_completa += "  ✗ FRACASADA"
            elif estado == "Suspendida":
                desc_completa += "  ⏸ SUSPENDIDA"

            if detenido and estado == "Pendiente":
                tag = "preso"
            elif estado == "Realizada":
                tag = "realizada"
            elif estado == "Fracasada":
                tag = "fracasada"
            elif estado == "Suspendida":
                tag = "suspendida"
            elif tipo in TIPOS_AGENDA_BLOQUEANTES:
                tag = "audiencia"
            else:
                tag = "normal"

            resp_fmt = (usuario or "").upper()

            self.agenda_tree.insert("", tk.END,
                                    values=(he_letra, resp_fmt, tipo_abrev,
                                            hora or "", desc_completa, id_reg),
                                    tags=(tag,))

        f_arg = self.agenda_fecha_sel.strftime("%d/%m/%Y")
        modo = "Pendientes" if solo_pend else "Todos los estados"
        self.agenda_lbl_conteo.config(
            text=f"{len(filas)} acto(s)  —  {f_arg}  —  {modo}"
        )
    # ──────────────────────────────────────────────────────────
    # 📋 COPIAR FECHA AL PORTAPAPELES
    # ──────────────────────────────────────────────────────────
    def _agenda_copiar_fecha(self):
        f = self.agenda_fecha_sel
        dias_es = ["lunes", "martes", "miércoles", "jueves",
                   "viernes", "sábado", "domingo"]
        texto_largo = f"{f.day} de {NOMBRES_MESES_ES[f.month]} de {f.year}"
        nombre_dia = dias_es[f.weekday()].capitalize()

        # Si hay un evento seleccionado, recuperamos su hora
        hora_evento = None
        seleccion = self.agenda_tree.selection()
        if seleccion:
            try:
                id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
                cur = self.conn.cursor()
                cur.execute("SELECT hora FROM agenda WHERE id=?", (id_reg,))
                row = cur.fetchone()
                if row and row[0]:
                    hora_evento = row[0]
            except Exception:
                pass

        pop = tk.Toplevel(self.root)
        pop.title("📋 Copiar fecha")
        pop.configure(bg="#FFEAEA")
        if hora_evento:
            self._centrar_popup(pop, 420, 320)
        else:
            self._centrar_popup(pop, 420, 250)

        tk.Label(pop, text=f"{nombre_dia} {texto_largo}",
                 font=("Segoe UI", 11, "bold"),
                 bg="#FFEAEA", fg="#922B21").pack(pady=10)
        tk.Label(pop, text="Elija el formato a copiar:",
                 font=("Segoe UI", 9), bg="#FFEAEA").pack()

        def copiar(txt):
            self.root.clipboard_clear()
            self.root.clipboard_append(txt)
            self.root.update()
            messagebox.showinfo("Copiado", f"✓ Copiado:\n\n{txt}", parent=pop)
            pop.destroy()

        ttk.Button(pop, text=f"📋  {f.strftime('%d/%m/%Y')}",
                   command=lambda: copiar(f.strftime("%d/%m/%Y"))
                   ).pack(pady=2, padx=20, fill="x")
        ttk.Button(pop, text=f"📋  {texto_largo}",
                   command=lambda: copiar(texto_largo)
                   ).pack(pady=2, padx=20, fill="x")
        ttk.Button(pop, text=f"📋  {nombre_dia} {texto_largo}",
                   command=lambda: copiar(f"{nombre_dia} {texto_largo}")
                   ).pack(pady=2, padx=20, fill="x")

        if hora_evento:
            tk.Label(pop, text=f"Con hora del evento ({hora_evento}):",
                     font=("Segoe UI", 9, "italic"),
                     bg="#FFEAEA").pack(pady=(8, 2))
            ttk.Button(pop, text=f"📋  {f.strftime('%d/%m/%Y')} {hora_evento} hs",
                       command=lambda: copiar(f"{f.strftime('%d/%m/%Y')} {hora_evento} hs")
                       ).pack(pady=2, padx=20, fill="x")
            ttk.Button(pop, text=f"📋  {texto_largo} a las {hora_evento} hs",
                       command=lambda: copiar(f"{texto_largo} a las {hora_evento} hs")
                       ).pack(pady=2, padx=20, fill="x")

    # ──────────────────────────────────────────────────────────
    # 📝 COPIAR DECRETO DE FIJACIÓN AL PORTAPAPELES
    # ──────────────────────────────────────────────────────────
    def _agenda_copiar_decreto(self):
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención",
                                    "Seleccione una audiencia/evento primero "
                                    "para generar el decreto de fijación.")
            return
        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("""SELECT tipo, expediente, fecha, hora, descripcion
                          FROM agenda WHERE id = ?""", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        tipo, expte, fecha, hora, desc = row
        try:
            fobj = datetime.strptime(fecha, "%Y-%m-%d")
            fecha_larga = f"{fobj.day} de {NOMBRES_MESES_ES[fobj.month]} de {fobj.year}"
        except Exception:
            fecha_larga = fecha

        # 🌟 NUEVO: Le pasamos el 'tipo' para que busque la plantilla específica
        plantilla = self._agenda_get_plantilla_decreto(tipo=tipo)
        
        try:
            decreto = plantilla.format(
                expte=expte or "",
                tipo=(tipo or "").lower(),
                fecha_larga=fecha_larga,
                hora=hora or "",
                descripcion=desc or "",
            )
        except KeyError as e:
            messagebox.showerror(
                "Error en plantilla",
                f"La plantilla del decreto referencia una variable desconocida: {e}\n\n"
                f"Variables válidas: {{expte}}, {{tipo}}, {{fecha_larga}}, {{hora}}, {{descripcion}}\n\n"
                f"Pídale al administrador que corrija la plantilla.")
            return

        self.root.clipboard_clear()
        self.root.clipboard_append(decreto)
        self.root.update()
        messagebox.showinfo("Decreto copiado",
                            "✓ Proyecto de decreto copiado al portapapeles.\n\n"
                            "Pegue con Ctrl+V en el SIGI.")
    # ──────────────────────────────────────────────────────────
    # 📅+ CALCULADORA DE PLAZOS (estilo Lex-Doctor)
    # ──────────────────────────────────────────────────────────
    def _sumar_dias_habiles(self, fecha_inicio, n):
        """Suma N días hábiles a una fecha, saltando fines de semana,
        feria judicial y feriados."""
        actual = fecha_inicio
        contador = 0
        max_iter = (n * 5) + 50  # blindaje contra loop infinito
        i = 0
        while contador < n and i < max_iter:
            actual = actual + timedelta(days=1)
            ok, _ = es_dia_habil(actual)
            if ok:
                contador += 1
            i += 1
        return actual

    def _agenda_modal_plazos(self):
        pop = tk.Toplevel(self.root)
        pop.title("⏳ Cómputo orientativo de plazo")
        pop.configure(bg="#F5F1EA")
        self._centrar_popup(pop, 540, 430)

        f0 = self.agenda_fecha_sel.replace(hour=0, minute=0, second=0, microsecond=0)

        bg = "#F5F1EA"
        panel_bg = "#FBF8F3"
        rojo = "#7A1E12"
        verde = "#1E7A4D"
        gris = "#5F5A50"

        panel = tk.Frame(pop, bg=panel_bg, bd=1, relief="solid")
        panel.pack(fill="both", expand=True, padx=12, pady=10)

        tk.Label(
            panel,
            text="Cómputo orientativo de plazo",
            font=("Segoe UI", 12, "bold"),
            bg=panel_bg,
            fg=rojo
        ).pack(anchor="w", padx=14, pady=(10, 2))

        tk.Label(
            panel,
            text="Herramienta auxiliar. Verificar dies a quo, notificación efectiva, plazo común o individual, feria, feriados y art. 180 CPP Chaco.",
            font=("Segoe UI", 8, "italic"),
            bg=panel_bg,
            fg=gris,
            wraplength=450,
            justify="left"
        ).pack(anchor="w", padx=14, pady=(0, 10))

        form = tk.Frame(panel, bg=panel_bg)
        form.pack(fill="x", padx=14)

        tk.Label(
            form,
            text="Fecha base:",
            font=("Segoe UI", 9, "bold"),
            bg=panel_bg
        ).grid(row=0, column=0, sticky="e", padx=6, pady=4)

        tk.Label(
            form,
            text=f0.strftime("%d/%m/%Y"),
            font=("Segoe UI", 10, "bold"),
            bg=panel_bg,
            fg=rojo
        ).grid(row=0, column=1, sticky="w", padx=6, pady=4)

        tk.Label(
            form,
            text="Sumar:",
            font=("Segoe UI", 9, "bold"),
            bg=panel_bg
        ).grid(row=1, column=0, sticky="e", padx=6, pady=4)

        ent_dias = ttk.Entry(form, width=8)
        ent_dias.insert(0, "5")
        ent_dias.grid(row=1, column=1, sticky="w", padx=6, pady=4)

        tk.Label(
            form,
            text="días",
            font=("Segoe UI", 9),
            bg=panel_bg
        ).grid(row=1, column=2, sticky="w", padx=6, pady=4)

        # 1 = hábiles, 2 = corridos. Evita errores por strings.
        modo = tk.IntVar(value=1)
        excluir_inicial = tk.BooleanVar(value=True)

        tk.Label(
            form,
            text="Modo:",
            font=("Segoe UI", 9, "bold"),
            bg=panel_bg
        ).grid(row=2, column=0, sticky="ne", padx=6, pady=4)

        radios = tk.Frame(form, bg=panel_bg)
        radios.grid(row=2, column=1, columnspan=3, sticky="w", padx=6, pady=4)

        ttk.Radiobutton(
            radios,
            text="Días hábiles procesales",
            variable=modo,
            value=1
        ).pack(anchor="w")

        ttk.Radiobutton(
            radios,
            text="Días corridos",
            variable=modo,
            value=2
        ).pack(anchor="w")

        tk.Checkbutton(
            form,
            text="Excluir el día inicial (dies a quo)",
            variable=excluir_inicial,
            bg=panel_bg,
            activebackground=panel_bg,
            selectcolor=panel_bg,
            font=("Segoe UI", 9)
        ).grid(row=3, column=1, columnspan=3, sticky="w", padx=6, pady=(2, 8))

        resultado_frame = tk.Frame(panel, bg="#F0ECE4", bd=1, relief="solid")
        resultado_frame.pack(fill="x", padx=14, pady=(4, 6))

        tk.Label(
            resultado_frame,
            text="Resultado",
            font=("Segoe UI", 9, "bold"),
            bg="#F0ECE4",
            fg=rojo
        ).pack(anchor="w", padx=10, pady=(6, 0))

        lbl_resultado = tk.Label(
            resultado_frame,
            text="Sin calcular",
            font=("Segoe UI", 10, "bold"),
            bg="#F0ECE4",
            fg=verde,
            justify="left",
            anchor="w",
            wraplength=470
        )
        lbl_resultado.pack(anchor="w", fill="x", padx=10, pady=(2, 6))

        ultimo_dia_plazo = [None]
        vencimiento_operativo = [None]

        def proximo_dia_habil(fecha):
            """
            Devuelve el día hábil siguiente.
            Se usa para reflejar el vencimiento operativo por la regla
            de las dos primeras horas del día hábil siguiente.
            """
            f = fecha + timedelta(days=1)
            while not es_dia_habil(f)[0]:
                f += timedelta(days=1)
            return f

        def calcular():
            try:
                n = int(ent_dias.get().strip())
                if n < 1:
                    raise ValueError
            except ValueError:
                messagebox.showerror(
                    "Error",
                    "Ingrese una cantidad válida de días.",
                    parent=pop
                )
                return

            excluir = excluir_inicial.get()

            if modo.get() == 1:
                # Días hábiles procesales:
                # Ej.: notificado 04/05/2026 + 3 días hábiles =
                # día 1: 05/05, día 2: 06/05, día 3: 07/05.
                # Vencimiento operativo: 08/05, dos primeras horas.
                if excluir:
                    ultimo = self._sumar_dias_habiles(f0, n)
                else:
                    if es_dia_habil(f0)[0]:
                        ultimo = f0 if n == 1 else self._sumar_dias_habiles(f0, n - 1)
                    else:
                        ultimo = self._sumar_dias_habiles(f0, n)

                vence = proximo_dia_habil(ultimo)
                tipo_txt = "días hábiles procesales"

            else:
                # Días corridos:
                # Se calcula el último día contado y, si corresponde,
                # se informa también el vencimiento operativo al día hábil siguiente.
                if excluir:
                    ultimo = f0 + timedelta(days=n)
                else:
                    ultimo = f0 + timedelta(days=max(n - 1, 0))

                vence = proximo_dia_habil(ultimo)
                tipo_txt = "días corridos"

            ultimo_dia_plazo[0] = ultimo
            vencimiento_operativo[0] = vence

            dias_es = [
                "lunes", "martes", "miércoles", "jueves",
                "viernes", "sábado", "domingo"
            ]

            lbl_resultado.config(
                text=(
                    f"Último día: {dias_es[ultimo.weekday()].capitalize()} {ultimo.strftime('%d/%m/%Y')}\n"
                    f"Vencimiento operativo: {dias_es[vence.weekday()].capitalize()} {vence.strftime('%d/%m/%Y')}\n"
                    f"Plazo computado: {n} {tipo_txt}\n"
                    f"Regla aplicada: dos primeras horas del día hábil siguiente"
                )
            )

        botones = tk.Frame(panel, bg=panel_bg)
        botones.pack(pady=(0, 6))

        tk.Button(
            botones,
            text="Calcular",
            command=calcular,
            bg=rojo,
            fg="white",
            activebackground="#5E160D",
            activeforeground="white",
            font=("Segoe UI", 9, "bold"),
            width=13,
            relief="raised",
            bd=1,
            cursor="hand2"
        ).pack(side="left", padx=4)

        def ir_a_resultado():
            if not vencimiento_operativo[0]:
                messagebox.showwarning("Atención", "Calcule primero.", parent=pop)
                return
            self._agenda_seleccionar_dia(vencimiento_operativo[0])
            pop.destroy()

        def crear_vencimiento():
            if not vencimiento_operativo[0]:
                messagebox.showwarning("Atención", "Calcule primero.", parent=pop)
                return

            try:
                n = int(ent_dias.get().strip())
            except Exception:
                n = 0

            destino = vencimiento_operativo[0]
            tipo_desc = "hábiles" if modo.get() == 1 else "corridos"

            pop.destroy()
            self._agenda_seleccionar_dia(destino)
            self.agenda_modal_carga(datos_precargados={
                "tipo": "Vencimiento de Plazo",
                "expediente": "",
                "descripcion": (
                    f"Calculo: ({n} días {tipo_desc}). "
                    f"Notifado el: {f0.strftime('%d/%m/%Y')}. "
                    f"Último día del plazo: {ultimo_dia_plazo[0].strftime('%d/%m/%Y')}. "
                    f"Vence: {vencimiento_operativo[0].strftime('%d/%m/%Y')} "
                    f"(2 hs.plazo de gracia)."
                ),
                "detenido": 0,
            })

        tk.Button(
            botones,
            text="Ir a fecha",
            command=ir_a_resultado,
            bg="#E8E2D8",
            fg="#222222",
            font=("Segoe UI", 9),
            width=12,
            relief="raised",
            bd=1,
            cursor="hand2"
        ).pack(side="left", padx=4)

        tk.Button(
            botones,
            text="Crear vencimiento",
            command=crear_vencimiento,
            bg="#D8E8D8",
            fg="#1E3D1E",
            font=("Segoe UI", 9, "bold"),
            width=17,
            relief="raised",
            bd=1,
            cursor="hand2"
        ).pack(side="left", padx=4)

        tk.Button(
            botones,
            text="Cerrar",
            command=pop.destroy,
            bg="#ECECEC",
            fg="#222222",
            font=("Segoe UI", 9),
            width=10,
            relief="raised",
            bd=1,
            cursor="hand2"
        ).pack(side="left", padx=4)

        ent_dias.focus()
    # ──────────────────────────────────────────────────────────
    # MODAL DE CARGA (también usado para reprogramar)
    # ──────────────────────────────────────────────────────────
    def agenda_modal_carga(self, datos_precargados=None):
        pop = tk.Toplevel(self.root)
        pop.title("➕ Agregar" if not datos_precargados else "🔁 Reprogramar")
        pop.configure(bg="#FFEAEA")
        self._centrar_popup(pop, 420, 340)

        form = tk.Frame(pop, bg="#FFEAEA")
        form.pack(padx=10, pady=7, fill="both", expand=True)

        # Tipo
        tk.Label(form, text="Tipo:", bg="#FFEAEA",
                 font=("Segoe UI", 9)).grid(row=0, column=0, sticky="e", padx=4, pady=4)
        combo_tipo = ttk.Combobox(form, width=34, state="readonly",
                                   values=TIPOS_AGENDA_TODOS, font=("Segoe UI", 9))
        combo_tipo.grid(row=0, column=1, columnspan=3, padx=4, pady=4, sticky="w")
        if datos_precargados:
            combo_tipo.set(datos_precargados.get("tipo", ""))

        # Expediente
        tk.Label(form, text="Expte:", bg="#FFEAEA",
                 font=("Segoe UI", 9)).grid(row=1, column=0, sticky="e", padx=4, pady=4)
        ent_expte = ttk.Entry(form, width=37, font=("Segoe UI", 9))
        ent_expte.grid(row=1, column=1, columnspan=3, padx=4, pady=4, sticky="w")
        if datos_precargados:
            ent_expte.insert(0, datos_precargados.get("expediente", ""))

        # Fecha + Hora en una sola fila
        tk.Label(form, text="Fecha:", bg="#FFEAEA",
                 font=("Segoe UI", 9)).grid(row=2, column=0, sticky="e", padx=4, pady=4)
        if HAY_CALENDARIO:
            ent_fecha = DateEntry(form, width=12, date_pattern="dd/MM/yyyy",
                                  locale="es_AR", background="#C0392B", foreground="white")
        else:
            ent_fecha = ttk.Entry(form, width=13, font=("Segoe UI", 9))
        ent_fecha.grid(row=2, column=1, padx=4, pady=4, sticky="w")
        # Pre-cargar con la fecha seleccionada del calendario
        try:
            if HAY_CALENDARIO and isinstance(ent_fecha, DateEntry):
                ent_fecha.set_date(self.agenda_fecha_sel)
            else:
                ent_fecha.delete(0, tk.END)
                ent_fecha.insert(0, self.agenda_fecha_sel.strftime("%d/%m/%Y"))
        except Exception:
            pass

        tk.Label(form, text="Hora:", bg="#FFEAEA",
                 font=("Segoe UI", 9)).grid(row=2, column=2, sticky="e", padx=4, pady=4)
        ent_hora = ttk.Entry(form, width=8, font=("Segoe UI", 9))
        ent_hora.insert(0, "09:00")
        ent_hora.grid(row=2, column=3, padx=4, pady=4, sticky="w")

        # Descripción
        tk.Label(form, text="Descripción:", bg="#FFEAEA",
                 font=("Segoe UI", 9)).grid(row=3, column=0, sticky="ne", padx=4, pady=4)
        txt_desc = tk.Text(form, width=37, height=3, font=("Segoe UI", 9))
        txt_desc.grid(row=3, column=1, columnspan=3, padx=4, pady=4, sticky="w")
        if datos_precargados:
            txt_desc.insert("1.0", datos_precargados.get("descripcion", ""))

        # Anotación breve
        tk.Label(form, text="Anotación:", bg="#FFEAEA",
                 font=("Segoe UI", 9, "bold")).grid(row=4, column=0, sticky="e", padx=4, pady=4)
        ent_anot = ttk.Entry(form, width=37, font=("Segoe UI", 9))
        ent_anot.grid(row=4, column=1, columnspan=3, padx=4, pady=4, sticky="w")
        if datos_precargados:
            ent_anot.insert(0, datos_precargados.get("anotacion", ""))

        # Detenido
        var_det = tk.IntVar(value=datos_precargados.get("detenido", 0) if datos_precargados else 0)
        ttk.Checkbutton(form, text="🚨 Causa con detenido",
                        variable=var_det).grid(row=5, column=1, columnspan=3,
                                               padx=4, pady=4, sticky="w")

        # Aviso día hábil en vivo
        lbl_aviso = tk.Label(form, text="", font=("Segoe UI", 8, "italic"),
                             bg="#FFEAEA", fg="#922B21")
        lbl_aviso.grid(row=6, column=0, columnspan=4, pady=2, sticky="w")

        def chequear_dia():
            try:
                if HAY_CALENDARIO and isinstance(ent_fecha, DateEntry):
                    d = ent_fecha.get_date()
                    f = datetime(d.year, d.month, d.day)
                else:
                    f = datetime.strptime(ent_fecha.get().strip(), "%d/%m/%Y")
                ok, motivo = es_dia_habil(f)
                lbl_aviso.config(text=f"{'✓' if ok else '⚠'} {motivo}",
                                 fg="#1E7A4D" if ok else "#C0392B")
            except Exception:
                lbl_aviso.config(text="")
        if HAY_CALENDARIO:
            ent_fecha.bind("<<DateEntrySelected>>", lambda e: chequear_dia())
        ent_fecha.bind("<KeyRelease>", lambda e: chequear_dia())
        chequear_dia()

        # Barra de botones inferior tipo Lex-Doctor
        barra_btn = tk.Frame(pop, bg="#D4D0C8", relief="raised", bd=1)
        barra_btn.pack(fill="x", side="bottom")

        def guardar():
            expte = normalizar_expte_basico(ent_expte.get())
            tipo = combo_tipo.get()
            desc = txt_desc.get("1.0", "end").strip()
            anotacion = ent_anot.get().strip()
            hora = ent_hora.get().strip()
            detenido = var_det.get()

            if not expte:
                messagebox.showwarning("Atención", "Ingrese el expediente.", parent=pop)
                return
            if not tipo:
                messagebox.showwarning("Atención", "Seleccione un tipo de acto.", parent=pop)
                return

            try:
                if HAY_CALENDARIO and isinstance(ent_fecha, DateEntry):
                    d = ent_fecha.get_date()
                    fecha_obj = datetime(d.year, d.month, d.day)
                else:
                    fecha_obj = datetime.strptime(ent_fecha.get().strip(), "%d/%m/%Y")
            except Exception:
                messagebox.showerror("Error", "Fecha inválida.", parent=pop)
                return

            ok, motivo = es_dia_habil(fecha_obj)
            if not ok:
                if not messagebox.askyesno("Día inhábil",
                                            f"⚠ {motivo}\n\n¿Cargar igualmente?",
                                            parent=pop):
                    return

            if tipo != "Vencimiento de Plazo":
                if not hora:
                    messagebox.showwarning("Atención",
                                            "El acto agendado requiere hora.",
                                            parent=pop)
                    return
                try:
                    datetime.strptime(hora, "%H:%M")
                except Exception:
                    messagebox.showerror("Error",
                                          "Formato de hora inválido. Use HH:MM.",
                                          parent=pop)
                    return
            else:
                if hora:
                    try:
                        datetime.strptime(hora, "%H:%M")
                    except Exception:
                        hora = ""

            fecha_str = fecha_obj.strftime("%Y-%m-%d")

            if tipo in TIPOS_AGENDA_BLOQUEANTES:
                cursor = self.conn.cursor()
                placeholders = ",".join(["?"] * len(TIPOS_AGENDA_BLOQUEANTES))
                cursor.execute(
                    f"""SELECT expediente, tipo FROM agenda
                        WHERE fecha = ? AND hora = ?
                          AND estado = 'Pendiente'
                          AND tipo IN ({placeholders})""",
                    [fecha_str, hora] + TIPOS_AGENDA_BLOQUEANTES)
                colision = cursor.fetchone()
                if colision:
                    messagebox.showerror(
                        "🚫 Colisión Magistratura",
                        f"El Juez ya tiene fijado:\n  • {colision[1]}\n  • Expte: {colision[0]}",
                        parent=pop)
                    return

            try:
                self._begin_exclusive()
                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor = self.conn.cursor()
                cursor.execute("""
                    INSERT INTO agenda (tipo, expediente, descripcion, anotacion, fecha, hora,
                                        detenido, estado, usuario_carga, fecha_carga)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?, ?)
                """, (tipo, expte, desc, anotacion, fecha_str, hora, detenido,
                      self.usuario_actual, ahora))
                reg_id = cursor.lastrowid
                detalle_log = f"{tipo} | {expte} | {fecha_str} {hora}"
                if anotacion:
                    detalle_log += f" | ANOTACIÓN: {anotacion}"
                if detenido:
                    detalle_log += " | CON DETENIDO"
                registrar_auditoria(self.conn, reg_id, "AGENDA_CREACION", "-",
                                    "-", detalle_log, self.usuario_actual)
                self._commit_y_sync()
                # Saltar al día del nuevo evento para verlo enseguida
                self.agenda_fecha_sel = fecha_obj
                pop.destroy()
                for fn in self.funciones_actualizar:
                    fn()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error",
                                      f"No se pudo guardar:\n{e}",
                                      parent=pop)

        tk.Button(barra_btn, text="✔ Acepta", command=guardar,
                  bg="#D4D0C8", relief="raised", bd=1,
                  font=("Segoe UI", 9, "bold"), width=10
                  ).pack(side="left", padx=4, pady=4)
        tk.Button(barra_btn, text="✗ Cancela", command=pop.destroy,
                  bg="#D4D0C8", relief="raised", bd=1,
                  font=("Segoe UI", 9), width=10
                  ).pack(side="left", padx=4, pady=4)

    # ──────────────────────────────────────────────────────────
    # MODIFICAR
    # ──────────────────────────────────────────────────────────
    def agenda_modal_modificar(self):
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un evento.")
            return

        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("""SELECT tipo, expediente, descripcion, anotacion, fecha, hora, detenido,
                                 estado, usuario_carga
                          FROM agenda WHERE id = ?""", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        tipo_a, expte_a, desc_a, anotacion_a, fecha_a, hora_a, det_a, estado_a, creador = row

        if self.rol_actual != "admin" and str(creador) != str(self.usuario_actual):
            if not messagebox.askyesno("Aviso",
                                        f"Este evento fue cargado por: {creador}\n"
                                        f"¿Modificar igualmente? (la modificación queda registrada en auditoría)"):
                return

        pop = tk.Toplevel(self.root)
        pop.title(f"✏️ Modificar evento")
        pop.configure(bg="#F0F0F0")
        self._centrar_popup(pop, 520, 545)

        tk.Label(pop, text="Modificando evento de agenda",
                 font=("Segoe UI", 13, "bold"), bg="#F0F0F0", fg="#333").pack(pady=10)

        form = tk.Frame(pop, bg="#F0F0F0")
        form.pack(pady=5, padx=20, fill="x")

        tk.Label(form, text="Expediente:", bg="#F0F0F0").grid(row=0, column=0, sticky="e", pady=6, padx=5)
        ent_expte = ttk.Entry(form, width=42)
        ent_expte.insert(0, expte_a or "")
        ent_expte.grid(row=0, column=1, columnspan=3, pady=6, padx=5, sticky="w")

        tk.Label(form, text="Tipo:", bg="#FFEAEA").grid(row=1, column=0, sticky="e", pady=6, padx=5)
        combo_tipo = ttk.Combobox(form, width=40, state="readonly", values=TIPOS_AGENDA_TODOS)
        combo_tipo.set(tipo_a or "")
        combo_tipo.grid(row=1, column=1, columnspan=3, pady=6, padx=5, sticky="w")

        tk.Label(form, text="Fecha:", bg="#FFEAEA").grid(row=2, column=0, sticky="e", pady=6, padx=5)
        if HAY_CALENDARIO:
            ent_fecha = DateEntry(form, width=14, date_pattern="dd/MM/yyyy",
                                  locale="es_AR", background="#C0392B", foreground="white")
            try:
                fobj = datetime.strptime(fecha_a, "%Y-%m-%d")
                ent_fecha.set_date(fobj)
            except Exception:
                pass
        else:
            ent_fecha = ttk.Entry(form, width=15)
            try:
                ent_fecha.insert(0, datetime.strptime(fecha_a, "%Y-%m-%d").strftime("%d/%m/%Y"))
            except Exception:
                pass
        ent_fecha.grid(row=2, column=1, pady=6, padx=5, sticky="w")

        tk.Label(form, text="Hora:", bg="#FFEAEA").grid(row=2, column=2, sticky="e", pady=6, padx=5)
        ent_hora = ttk.Entry(form, width=10)
        ent_hora.insert(0, hora_a or "")
        ent_hora.grid(row=2, column=3, pady=6, padx=5, sticky="w")

        tk.Label(form, text="Descripción:", bg="#FFEAEA").grid(row=3, column=0, sticky="ne", pady=6, padx=5)
        txt_desc = tk.Text(form, width=42, height=4, font=("Segoe UI", 10))
        txt_desc.insert("1.0", desc_a or "")
        txt_desc.grid(row=3, column=1, columnspan=3, pady=6, padx=5, sticky="w")

        tk.Label(form, text="Anotación:", bg="#FFEAEA", font=("Segoe UI", 9, "bold")).grid(
            row=4, column=0, sticky="e", pady=6, padx=5)
        ent_anot = ttk.Entry(form, width=42)
        ent_anot.insert(0, anotacion_a or "")
        ent_anot.grid(row=4, column=1, columnspan=3, pady=6, padx=5, sticky="w")

        var_det = tk.IntVar(value=det_a or 0)
        ttk.Checkbutton(form, text="🚨 Causa con detenido", variable=var_det).grid(
            row=5, column=1, columnspan=3, pady=10, sticky="w")

        def guardar():
            n_expte = ent_expte.get().strip()
            n_tipo = combo_tipo.get()
            n_desc = txt_desc.get("1.0", "end").strip()
            n_anotacion = ent_anot.get().strip()
            n_hora = ent_hora.get().strip()
            n_det = var_det.get()

            try:
                if HAY_CALENDARIO and isinstance(ent_fecha, DateEntry):
                    d = ent_fecha.get_date()
                    n_fecha_obj = datetime(d.year, d.month, d.day)
                else:
                    n_fecha_obj = datetime.strptime(ent_fecha.get().strip(), "%d/%m/%Y")
            except Exception:
                messagebox.showerror("Error", "Fecha inválida.", parent=pop)
                return

            n_fecha = n_fecha_obj.strftime("%Y-%m-%d")

            try:
                self._begin_exclusive()
                cursor = self.conn.cursor()
                cursor.execute("""UPDATE agenda
                                  SET tipo=?, expediente=?, descripcion=?, anotacion=?, fecha=?, hora=?, detenido=?
                                  WHERE id=?""",
                               (n_tipo, n_expte, n_desc, n_anotacion, n_fecha, n_hora, n_det, id_reg))

                # Auditoría: solo loggeo lo que cambió
                cambios = []
                if n_tipo != tipo_a: cambios.append(("tipo", tipo_a or "", n_tipo))
                if n_expte != (expte_a or ""): cambios.append(("expediente", expte_a or "", n_expte))
                if n_desc != (desc_a or ""): cambios.append(("descripcion", desc_a or "", n_desc))
                if n_anotacion != (anotacion_a or ""): cambios.append(("anotacion", anotacion_a or "", n_anotacion))
                if n_fecha != fecha_a: cambios.append(("fecha", fecha_a or "", n_fecha))
                if n_hora != (hora_a or ""): cambios.append(("hora", hora_a or "", n_hora))
                if n_det != (det_a or 0): cambios.append(("detenido", str(det_a or 0), str(n_det)))

                for campo, ant, nuevo in cambios:
                    registrar_auditoria(self.conn, id_reg, "AGENDA_MODIFICACION",
                                        campo, ant, nuevo, self.usuario_actual)

                self._commit_y_sync()
                pop.destroy()
                for fn in self.funciones_actualizar:
                    fn()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"No se pudo modificar:\n{e}", parent=pop)

        ttk.Button(pop, text="💾 Guardar cambios", command=guardar, style="Accent.TButton").pack(pady=15)

    # ──────────────────────────────────────────────────────────
    # CAMBIO DE ESTADO
    # ──────────────────────────────────────────────────────────
    def agenda_cambiar_estado(self, nuevo_estado):
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un evento.")
            return

        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT estado, tipo, expediente FROM agenda WHERE id = ?", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        estado_ant, tipo, expte = row

        if estado_ant == nuevo_estado:
            messagebox.showinfo("Info", f"Este evento ya está en estado {nuevo_estado}.")
            return

        if not messagebox.askyesno("Confirmar",
                                    f"Marcar como {nuevo_estado.upper()}:\n\n"
                                    f"  {tipo} — {expte}\n\n¿Confirmar?"):
            return

        try:
            self._begin_exclusive()
            ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor = self.conn.cursor()
            cursor.execute("""UPDATE agenda
                              SET estado=?, usuario_resolucion=?, fecha_resolucion=?
                              WHERE id=?""",
                           (nuevo_estado, self.usuario_actual, ahora, id_reg))
            registrar_auditoria(self.conn, id_reg, f"AGENDA_{nuevo_estado.upper()}",
                                "estado", estado_ant, nuevo_estado, self.usuario_actual)
            self._commit_y_sync()
            for fn in self.funciones_actualizar:
                fn()
        except Exception as e:
            self._safe_rollback()
            messagebox.showerror("Error", f"No se pudo actualizar:\n{e}")

    # ──────────────────────────────────────────────────────────
    # FRACASO/SUSPENSIÓN con opción de reprogramar
    # ──────────────────────────────────────────────────────────
    def agenda_reprogramar_workflow(self, nuevo_estado):
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un evento.")
            return

        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("""SELECT tipo, expediente, descripcion, detenido, estado
                          FROM agenda WHERE id = ?""", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        tipo, expte, desc, det, estado_ant = row

        self.agenda_cambiar_estado(nuevo_estado)

        # Solo ofrecer reprogramar si efectivamente cambió de estado
        if estado_ant == nuevo_estado:
            return

        if messagebox.askyesno("Reprogramar",
                                f"El evento quedó como {nuevo_estado}.\n\n"
                                f"  {tipo} — {expte}\n\n"
                                f"¿Desea fijar nueva fecha y hora ahora?"):
            self.agenda_modal_carga(datos_precargados={
                "tipo": tipo,
                "expediente": expte,
                "descripcion": desc,
                "detenido": det,
            })

    def agenda_reprogramar_directa(self):
        """Clona los datos del evento seleccionado en un modal nuevo,
        sin marcar nada como fracasado."""
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un evento.")
            return

        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("""SELECT tipo, expediente, descripcion, detenido
                          FROM agenda WHERE id = ?""", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        tipo, expte, desc, det = row

        self.agenda_modal_carga(datos_precargados={
            "tipo": tipo,
            "expediente": expte,
            "descripcion": desc,
            "detenido": det,
        })

    # ──────────────────────────────────────────────────────────
    # BORRAR (admin)
    # ──────────────────────────────────────────────────────────
    def agenda_borrar(self):
        if self.rol_actual != "admin":
            messagebox.showerror("Acceso denegado", "Solo admins pueden borrar.")
            return
        seleccion = self.agenda_tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un evento.")
            return

        id_reg = self.agenda_tree.item(seleccion[0])["values"][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT tipo, expediente, fecha, hora FROM agenda WHERE id = ?", (id_reg,))
        row = cursor.fetchone()
        if not row:
            return
        tipo, expte, fecha, hora = row

        if not messagebox.askyesno("⚠️ Borrado físico",
                                    f"¿BORRAR DEFINITIVAMENTE este evento?\n\n"
                                    f"  {tipo} — {expte}\n  {fecha} {hora}\n\n"
                                    f"Para preservar el historial conviene marcar como "
                                    f"Fracasada o Suspendida en lugar de borrar."):
            return

        try:
            self._begin_exclusive()
            registrar_auditoria(self.conn, id_reg, "AGENDA_BORRADO", "registro_completo",
                                f"{tipo} | {expte} | {fecha} {hora}", "ELIMINADO",
                                self.usuario_actual)
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM agenda WHERE id = ?", (id_reg,))
            self._commit_y_sync()
            for fn in self.funciones_actualizar:
                fn()
        except Exception as e:
            self._safe_rollback()
            messagebox.showerror("Error", f"No se pudo borrar:\n{e}")

    # ──────────────────────────────────────────────────────────
    # EXPORTAR A EXCEL (MODAL ESTILO LEX-DOCTOR)
    # ──────────────────────────────────────────────────────────
    def agenda_exportar_excel(self):
        pop = tk.Toplevel(self.root)
        pop.title("Listado de agendamientos")
        pop.geometry("560x340")
        pop.transient(self.root)
        pop.grab_set()
        pop.configure(bg="#D4D0C8") # Gris clásico

        # ── Menú superior (Hace / Sale) ──
        menu_frame = tk.Frame(pop, bg="#D4D0C8", bd=1, relief="raised")
        menu_frame.pack(fill="x", side="top")
        
        btn_hace = tk.Label(menu_frame, text="Hace", bg="#D4D0C8", font=("Tahoma", 9, "bold"), cursor="hand2")
        btn_hace.pack(side="left", padx=8, pady=2)
        
        btn_sale = tk.Label(menu_frame, text="Sale", bg="#D4D0C8", font=("Tahoma", 9), cursor="hand2")
        btn_sale.pack(side="left", padx=8, pady=2)
        btn_sale.bind("<Button-1>", lambda e: pop.destroy())

        # ── Formulario ──
        form = tk.Frame(pop, bg="#D4D0C8")
        form.pack(pady=10, padx=15, fill="both", expand=True)

        def lbl_rojo(r, c, txt, **kwargs):
            tk.Label(form, text=txt, fg="#A00000", bg="#D4D0C8", font=("Tahoma", 9)).grid(row=r, column=c, sticky="e", pady=6, padx=5, **kwargs)

        # 1. Responsable
        lbl_rojo(0, 0, "Responsable:")
        cur = self.conn.cursor()
        usr_db = [u[0].upper() for u in cur.execute("SELECT nombre FROM usuarios ORDER BY nombre").fetchall()]
        cb_resp = ttk.Combobox(form, values=["Todos"] + usr_db, state="readonly", width=38)
        cb_resp.set("Todos")
        cb_resp.grid(row=0, column=1, columnspan=3, sticky="w")

        # 2. Desde / Hasta
        lbl_rojo(1, 0, "Desde:")
        if HAY_CALENDARIO:
            e_desde = DateEntry(
                form,
                width=12,
                date_pattern="dd/MM/yyyy",
                locale="es_AR",
                background="#C0392B",
                foreground="white"
            )
            # Lo dejamos vacío para que "Todos" no filtre por fecha.
            e_desde.delete(0, tk.END)
        else:
            e_desde = ttk.Entry(form, width=12)
        e_desde.grid(row=1, column=1, sticky="w")
        
        tk.Label(form, text="Hasta:", bg="#D4D0C8", font=("Tahoma", 9)).grid(row=1, column=2, sticky="e", padx=5)
        if HAY_CALENDARIO:
            e_hasta = DateEntry(
                form,
                width=12,
                date_pattern="dd/MM/yyyy",
                locale="es_AR",
                background="#C0392B",
                foreground="white"
            )
            # También vacío: sólo filtra si el usuario elige/carga fecha.
            e_hasta.delete(0, tk.END)
        else:
            e_hasta = ttk.Entry(form, width=12)
        e_hasta.grid(row=1, column=3, sticky="w")

        # 3. Tipo (Frame con Checkboxes) y Estado
        mid_frame = tk.Frame(form, bg="#D4D0C8")
        mid_frame.grid(row=2, column=1, columnspan=3, sticky="w", pady=6)
        
        frame_tipo = tk.LabelFrame(mid_frame, text="Tipo", bg="#D4D0C8", fg="#000000", font=("Tahoma", 9))
        frame_tipo.pack(side="left", padx=(0, 20), ipadx=5, ipady=2)
        
        var_tarea = tk.BooleanVar(value=True)
        var_audie = tk.BooleanVar(value=True)
        var_venci = tk.BooleanVar(value=True)
        
        tk.Checkbutton(frame_tipo, text="Tarea", variable=var_tarea, bg="#D4D0C8", font=("Tahoma", 9)).pack(anchor="w")
        tk.Checkbutton(frame_tipo, text="Audiencia", variable=var_audie, bg="#D4D0C8", font=("Tahoma", 9)).pack(anchor="w")
        tk.Checkbutton(frame_tipo, text="Vencimiento", variable=var_venci, bg="#D4D0C8", font=("Tahoma", 9)).pack(anchor="w")
        
        estado_frame = tk.Frame(mid_frame, bg="#D4D0C8")
        estado_frame.pack(side="left", anchor="s", pady=5)
        tk.Label(estado_frame, text="Estado:", bg="#D4D0C8", font=("Tahoma", 9)).pack(side="left", padx=5)
        cb_estado = ttk.Combobox(estado_frame, values=["Todo", "Pendiente", "Realizada", "Fracasada", "Suspendida"], state="readonly", width=12)
        cb_estado.set("Todo")
        cb_estado.pack(side="left")

        # 4. Proceso / Tipo específico
        lbl_rojo(3, 0, "Proceso:")
        cb_proceso = ttk.Combobox(
            form,
            values=["Todos"] + TIPOS_AGENDA_TODOS,
            state="normal",
            width=41
        )
        cb_proceso.set("Todos")
        cb_proceso.grid(row=3, column=1, columnspan=3, sticky="w")

        # 5. Modelo de listado
        lbl_rojo(4, 0, "Modelo de listado:")
        e_modelo = ttk.Entry(form, width=41)
        e_modelo.insert(0, "Listado General a Excel")
        e_modelo.config(state="readonly")
        e_modelo.grid(row=4, column=1, columnspan=3, sticky="w")

        # ── Lógica de Exportación ──
        # ── Lógica de Exportación ──
        def ejecutar_hace(event=None):
            resp = cb_resp.get()
            desde = e_desde.get().strip()
            hasta = e_hasta.get().strip()
            estado = cb_estado.get()
            proc = cb_proceso.get().strip()
            
            # 🌟 Mapeo exacto con los nombres reales guardados en la tabla agenda
            tipos_filtro = []

            if var_audie.get():
                tipos_filtro.extend([
                    "Lectura / Firma de Sentencia",
                    "Audiencia de Debate",
                    "Audiencia Preliminar",
                    "Nueva Audiencia Preliminar",
                    "Audiencia de Visu",
                    "Audiencia de Conciliación",

                    "Cita Damnificada",
                    "Cita Damnificada/Probation",
                    "Cita Damnificada/Mediación",
                    "Cita Damnificada/Conciliación",
                    "Cita Imputado",
                    "Cita Imputado/Reglas de Conducta",
                    "Admisión de Pruebas",

                    # Compatibilidad con registros viejos
                    "Juicio Abreviado (firma)",
                    "Audiencia de Probation",
                    "Audiencia de Mediación",
                    "Declaración Testimonial",
                    "Citación a Imputado",
                    "Citación a Víctima",
                ])

            if var_venci.get():
                tipos_filtro.append("Vencimiento de Plazo")

            if var_tarea.get():
                tipos_filtro.append("Trámite / Otro")

            # Quita duplicados sin alterar el orden
            tipos_filtro = list(dict.fromkeys(tipos_filtro))

            # Si en "Proceso" se eligió un tipo real, ese filtro exacto manda.
            proceso_es_tipo_exacto = bool(proc and proc != "Todos" and proc in TIPOS_AGENDA_TODOS)
                
            if not tipos_filtro and not proceso_es_tipo_exacto:
                messagebox.showwarning(
                    "Atención",
                    "Debe tildar al menos un Tipo o elegir un Proceso específico.",
                    parent=pop
                )
                return

            query = """SELECT fecha, hora, usuario_carga, tipo, expediente, descripcion, anotacion, detenido, estado 
                       FROM agenda WHERE 1=1"""
            params = []

            # Filtro 1: Responsable
            if resp != "Todos":
                query += " AND lower(usuario_carga) = ?"
                params.append(resp.lower())
                
            # Filtro 2: Desde
            if desde:
                try:
                    f_desde = datetime.strptime(desde, "%d/%m/%Y").strftime("%Y-%m-%d")
                    query += " AND fecha >= ?"
                    params.append(f_desde)
                except:
                    messagebox.showerror("Error", "Fecha 'Desde' inválida. Use DD/MM/AAAA", parent=pop)
                    return
                    
            # Filtro 3: Hasta
            if hasta:
                try:
                    f_hasta = datetime.strptime(hasta, "%d/%m/%Y").strftime("%Y-%m-%d")
                    query += " AND fecha <= ?"
                    params.append(f_hasta)
                except:
                    messagebox.showerror("Error", "Fecha 'Hasta' inválida. Use DD/MM/AAAA", parent=pop)
                    return

            # Filtro 4: Estado
            if estado != "Todo":
                query += " AND estado = ?"
                params.append(estado)

            # Filtro 5: Proceso / Tipo específico
            # - "Todos" no filtra nada.
            # - Si es un tipo real del combo, filtra exacto por tipo.
            # - Si se escribió texto libre, busca en expediente/descripcion/tipo.
            if proceso_es_tipo_exacto:
                query += " AND tipo = ?"
                params.append(proc)

            else:
                if tipos_filtro:
                    placeholders = ",".join(["?"] * len(tipos_filtro))
                    query += f" AND tipo IN ({placeholders})"
                    params.extend(tipos_filtro)

                if proc and proc != "Todos":
                    query += " AND (expediente LIKE ? OR descripcion LIKE ? OR tipo LIKE ?)"
                    params.extend([f"%{proc}%", f"%{proc}%", f"%{proc}%"])

            query += " ORDER BY fecha ASC, hora ASC"

            cursor = self.conn.cursor()
            cursor.execute(query, params)
            datos = cursor.fetchall()

            if not datos:
                messagebox.showinfo("Listado", "No se encontraron agendamientos con esos parámetros.", parent=pop)
                return

            # Generar Excel o CSV
            try:
                import pandas as pd
                df = pd.DataFrame(datos, columns=[
                    "Fecha", "Hora", "Responsable", "Tipo", "Expediente",
                    "Descripción", "Anotación", "Con detenido", "Estado"
                ])
                df["Fecha"] = pd.to_datetime(df["Fecha"]).dt.strftime("%d/%m/%Y")
                df["Con detenido"] = df["Con detenido"].apply(lambda x: "SÍ" if x else "")

                fp = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")], 
                                                  initialfile=f"Agendamientos_{datetime.now().strftime('%Y%m%d')}.xlsx", parent=pop)
                if not fp: return
                
                with pd.ExcelWriter(fp, engine="openpyxl") as writer:
                    df.to_excel(writer, sheet_name="Agendamientos", index=False)
                
                messagebox.showinfo("Proceso terminado", f"Listado exportado correctamente a:\n{fp}", parent=pop)
                pop.destroy()
                
            except ImportError:
                fp = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV Excel", "*.csv")], 
                                                  initialfile=f"Agendamientos_{datetime.now().strftime('%Y%m%d')}.csv", parent=pop)
                if not fp: return
                import csv
                with open(fp, mode='w', newline='', encoding='utf-8-sig') as f:
                    w = csv.writer(f, delimiter=';')
                    w.writerow(["Fecha", "Hora", "Responsable", "Tipo", "Expediente", "Descripción", "Anotación", "Con detenido", "Estado"])
                    w.writerows(datos)
                messagebox.showinfo("Proceso terminado", "Exportado en formato CSV compatible con Excel.", parent=pop)
                pop.destroy()

        # En Lex-Doctor al hacer click en el texto "Hace" del menú de arriba se ejecuta
        btn_hace.bind("<Button-1>", ejecutar_hace)
    # ──────────────────────────────────────────────────────────
    # ALERTAS DE AGENDA AL INGRESAR
    # ──────────────────────────────────────────────────────────
    def verificar_alertas_agenda(self, manual=False):
        """Avisa los eventos pendientes de hoy y los atrasados sin resolver."""
        try:
            hoy = datetime.now().strftime("%Y-%m-%d")
            cursor = self.conn.cursor()

            cursor.execute("""SELECT tipo, expediente, hora, detenido FROM agenda
                              WHERE fecha = ? AND estado = 'Pendiente'
                              ORDER BY hora ASC""", (hoy,))
            de_hoy = cursor.fetchall()

            cursor.execute("""SELECT tipo, expediente, fecha, detenido FROM agenda
                              WHERE fecha < ? AND estado = 'Pendiente'
                              ORDER BY fecha ASC""", (hoy,))
            atrasados = cursor.fetchall()

            if not de_hoy and not atrasados:
                if manual:
                    messagebox.showinfo("Agenda — Avisos", "No hay eventos pendientes para hoy ni atrasados.")
                return

            partes = []
            if atrasados:
                txt = f"⚠️ ATRASADOS sin resolver ({len(atrasados)}):\n"
                for tipo, expte, fecha, det in atrasados[:10]:
                    f_arg = datetime.strptime(fecha, "%Y-%m-%d").strftime("%d/%m/%Y")
                    preso = " 🚨" if det else ""
                    txt += f"   • {f_arg} — {tipo} — {expte}{preso}\n"
                if len(atrasados) > 10:
                    txt += f"   ... y {len(atrasados) - 10} más.\n"
                partes.append(txt)

            if de_hoy:
                txt = f"📅 PARA HOY ({len(de_hoy)}):\n"
                for tipo, expte, hora, det in de_hoy:
                    preso = " 🚨" if det else ""
                    txt += f"   • {hora or '--:--'} — {tipo} — {expte}{preso}\n"
                partes.append(txt)

            mensaje = "\n".join(partes)
            hay_preso = any(d for _, _, _, d in (list(de_hoy) + list(atrasados)))
            titulo = "Agenda — Avisos" if manual else "Agenda — Aviso al iniciar"

            if atrasados or hay_preso:
                messagebox.showwarning(titulo, mensaje)
            else:
                messagebox.showinfo(titulo, mensaje)
        except Exception as e:
            print(f"⚠️  No se pudo verificar agenda al iniciar: {e}")
    # ──────────────────────────────────────────────────────────
    # PANEL SUPERUSUARIO (JUEZ)
    # ──────────────────────────────────────────────────────────
    def panel_superusuario(self):
        pop = tk.Toplevel(self.root)
        pop.title("👑 Gestión de Claves de Empleados")
        pop.geometry("500x520")
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text="Usuarios y Contraseñas", font=("Segoe UI", 12, "bold")).pack(pady=10)

        columnas = ("Nombre", "Contraseña", "Rol")
        tree_usr = ttk.Treeview(pop, columns=columnas, show="headings", height=8)
        for col in columnas:
            tree_usr.heading(col, text=col)
        tree_usr.column("Nombre", width=180)
        tree_usr.column("Contraseña", width=120, anchor="center")
        tree_usr.column("Rol", width=100, anchor="center")
        tree_usr.pack(pady=5, padx=10, fill="x")

        # 🔒 Variable para mostrar/ocultar contraseñas
        mostrar_pass = tk.BooleanVar(value=False)

        def cargar_usuarios():
            for item in tree_usr.get_children():
                tree_usr.delete(item)
            cursor = self.conn.cursor()
            cursor.execute("SELECT nombre, password, rol FROM usuarios ORDER BY rol, nombre")
            for fila in cursor.fetchall():
                nombre, pwd, rol = fila
                pwd_display = pwd if mostrar_pass.get() else "••••••"
                tree_usr.insert("", tk.END, values=(nombre, pwd_display, rol))

        cargar_usuarios()

        chk_ver = ttk.Checkbutton(pop, text="👁 Mostrar contraseñas", variable=mostrar_pass,
                                  command=cargar_usuarios)
        chk_ver.pack(pady=3)

        frame_edicion = tk.Frame(pop)
        frame_edicion.pack(pady=10)

        tk.Label(frame_edicion, text="Nueva clave:").grid(row=0, column=0, padx=5)
        ent_nueva_clave = ttk.Entry(frame_edicion, width=15)
        ent_nueva_clave.grid(row=0, column=1, padx=5)

        def forzar_cambio():
            seleccion = tree_usr.selection()
            if not seleccion:
                messagebox.showwarning("Atención", "Seleccione un usuario.", parent=pop)
                return
            nueva_clave = ent_nueva_clave.get().strip()
            if len(nueva_clave) < 4:
                messagebox.showwarning("Atención", "Mínimo 4 caracteres.", parent=pop)
                return
            usuario_sel = tree_usr.item(seleccion[0])['values'][0]
            if messagebox.askyesno("Confirmar", f"¿Cambiar clave de {usuario_sel}?", parent=pop):
                try:
                    cursor = self.conn.cursor()
                    cursor.execute("UPDATE usuarios SET password = ? WHERE nombre = ?", (nueva_clave, usuario_sel))
                    self._commit_y_sync()
                    messagebox.showinfo("Éxito", f"Clave de {usuario_sel} actualizada.", parent=pop)
                    ent_nueva_clave.delete(0, tk.END)
                    cargar_usuarios()
                except Exception as e:
                    messagebox.showerror("Error", f"Fallo:\n{e}", parent=pop)

        ttk.Button(frame_edicion, text="💾 Forzar Cambio", command=forzar_cambio).grid(row=0, column=2, padx=10)

        # Botones extra: feriados y plantilla de decreto
        ttk.Separator(pop, orient="horizontal").pack(fill="x", pady=8, padx=20)
        frame_extra = tk.Frame(pop)
        frame_extra.pack(pady=5)
        ttk.Button(frame_extra, text="🗓 Editar feriados",
                   command=lambda: (pop.destroy(), self.panel_feriados())
                   ).pack(side="left", padx=5)
        ttk.Button(frame_extra, text="📝 Editar plantilla de decreto",
                   command=lambda: (pop.destroy(), self.panel_plantilla_decreto())
                   ).pack(side="left", padx=5)
    # ──────────────────────────────────────────────────────────
    # 🗓 PANEL FERIADOS (admin)
    # ──────────────────────────────────────────────────────────
    def panel_feriados(self):
        if self.rol_actual != "admin":
            messagebox.showerror("Acceso denegado", "Solo administradores.")
            return
        pop = tk.Toplevel(self.root)
        pop.title("🗓 Gestión de feriados")
        self._centrar_popup(pop, 760, 650, redimensionable=True)

        tk.Label(pop, text="Feriados — permanentes y excepcionales",
                 font=("Segoe UI", 12, "bold")).pack(pady=10)

        bar = tk.Frame(pop)
        bar.pack(fill="x", padx=15)
        var_tipo = tk.StringVar(value="TODOS")
        ttk.Radiobutton(bar, text="Todos", variable=var_tipo, value="TODOS",
                        command=lambda: cargar()).pack(side="left", padx=5)
        ttk.Radiobutton(bar, text="Permanentes (todos los años)",
                        variable=var_tipo, value="PERMANENTE",
                        command=lambda: cargar()).pack(side="left", padx=5)
        ttk.Radiobutton(bar, text="Excepcionales (fecha exacta)",
                        variable=var_tipo, value="EXCEPCIONAL",
                        command=lambda: cargar()).pack(side="left", padx=5)

        # 🌟 MEJORA 2: Creamos un Frame contenedor para la tabla y su Scrollbar
        frame_tabla = tk.Frame(pop)
        frame_tabla.pack(padx=15, pady=8, fill="both", expand=True)

        cols = ("Fecha", "Descripción", "Tipo", "ID")
        visibles = ("Fecha", "Descripción", "Tipo")
        
        # 🌟 MEJORA 3: Reducimos el height inicial de 15 a 10 para que no empuje el formulario
        tree = ttk.Treeview(frame_tabla, columns=cols, show="headings", height=10,
                            displaycolumns=visibles)
        tree.column("Fecha", width=140, anchor="center")
        tree.column("Descripción", width=380)
        tree.column("Tipo", width=120, anchor="center")
        for c in cols:
            tree.heading(c, text=c)

        # 🌟 Agregamos la barra de desplazamiento
        scroll_y = ttk.Scrollbar(frame_tabla, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scroll_y.set)
        
        tree.pack(side="left", fill="both", expand=True)
        scroll_y.pack(side="right", fill="y")

        def cargar():
            for it in tree.get_children():
                tree.delete(it)
            cur = self.conn.cursor()
            if var_tipo.get() == "TODOS":
                # Ordena solo por fecha, sin importar si es permanente o excepcional
                cur.execute("SELECT id, fecha, descripcion, tipo FROM feriados ORDER BY fecha")
            else:
                cur.execute("SELECT id, fecha, descripcion, tipo FROM feriados WHERE tipo=? ORDER BY fecha",
                            (var_tipo.get(),))
            for id_f, fecha, desc, tipo in cur.fetchall():
                if tipo == "PERMANENTE":
                    try:
                        m, d = fecha.split("-")
                        fecha_disp = f"{int(d):02d}/{int(m):02d} (anual)"
                    except Exception:
                        fecha_disp = fecha
                else:
                    try:
                        fobj = datetime.strptime(fecha, "%Y-%m-%d")
                        fecha_disp = fobj.strftime("%d/%m/%Y")
                    except Exception:
                        fecha_disp = fecha
                tree.insert("", tk.END, values=(fecha_disp, desc, tipo, id_f))

        cargar()

        # ── Formulario de Carga ──
        form = tk.Frame(pop, bg="#F0F0F0", relief="groove", bd=1)
        form.pack(fill="x", padx=15, pady=8)

        tk.Label(form, text="Tipo:", bg="#F0F0F0").grid(row=0, column=0, padx=4, pady=6, sticky="e")
        cb_tipo = ttk.Combobox(form, values=["PERMANENTE", "EXCEPCIONAL"],
                                state="readonly", width=14)
        cb_tipo.set("EXCEPCIONAL")
        cb_tipo.grid(row=0, column=1, padx=4, pady=6, sticky="w")

        tk.Label(form, text="Fecha:", bg="#F0F0F0").grid(row=0, column=2, padx=4, pady=6, sticky="e")
        ent_fecha = ttk.Entry(form, width=14)
        ent_fecha.grid(row=0, column=3, padx=4, pady=6, sticky="w")
        tk.Label(form, text="DD/MM/AAAA — o DD/MM si es permanente",
                 font=("Segoe UI", 8, "italic"),
                 bg="#F0F0F0", fg="#666"
                 ).grid(row=1, column=1, columnspan=3, sticky="w", padx=4)

        tk.Label(form, text="Descripción:", bg="#F0F0F0").grid(row=2, column=0, padx=4, pady=6, sticky="e")
        ent_desc = ttk.Entry(form, width=58)
        ent_desc.grid(row=2, column=1, columnspan=3, padx=4, pady=6, sticky="w")

        def agregar():
            tipo = cb_tipo.get()
            f_str = ent_fecha.get().strip()
            desc = ent_desc.get().strip()
            if not f_str or not desc:
                messagebox.showwarning("Atención", "Complete fecha y descripción.", parent=pop)
                return
            try:
                if tipo == "PERMANENTE":
                    partes = f_str.split("/")
                    if len(partes) < 2:
                        raise ValueError
                    d, m = int(partes[0]), int(partes[1])
                    if not (1 <= m <= 12 and 1 <= d <= 31):
                        raise ValueError
                    fecha_db = f"{m:02d}-{d:02d}"
                else:
                    fobj = datetime.strptime(f_str, "%d/%m/%Y")
                    fecha_db = fobj.strftime("%Y-%m-%d")
            except Exception:
                messagebox.showerror("Error", "Formato de fecha inválido.", parent=pop)
                return
            try:
                self._begin_exclusive()
                cur = self.conn.cursor()
                cur.execute("INSERT INTO feriados (fecha, descripcion, tipo) VALUES (?, ?, ?)",
                            (fecha_db, desc, tipo))
                registrar_auditoria(self.conn, cur.lastrowid, "FERIADO_AGREGADO",
                                    "fecha", "-", f"{tipo} {fecha_db} — {desc}",
                                    self.usuario_actual)
                self._commit_y_sync()
                cargar_feriados_de_db(self.conn)
                cargar()
                ent_fecha.delete(0, tk.END)
                ent_desc.delete(0, tk.END)
                if hasattr(self, "_agenda_refresh_completo"):
                    self._agenda_refresh_completo()
            except sqlite3.IntegrityError:
                self._safe_rollback()
                messagebox.showerror("Error", "Ya existe ese feriado.", parent=pop)
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"{e}", parent=pop)

        def borrar():
            sel = tree.selection()
            if not sel:
                messagebox.showwarning("Atención", "Seleccione un feriado.", parent=pop)
                return
            id_f = tree.item(sel[0])["values"][-1]
            desc = tree.item(sel[0])["values"][1]
            if not messagebox.askyesno("Confirmar",
                                        f"¿Eliminar feriado?\n\n{desc}", parent=pop):
                return
            try:
                self._begin_exclusive()
                cur = self.conn.cursor()
                cur.execute("DELETE FROM feriados WHERE id=?", (id_f,))
                registrar_auditoria(self.conn, id_f, "FERIADO_BORRADO",
                                    "registro", desc, "ELIMINADO", self.usuario_actual)
                self._commit_y_sync()
                cargar_feriados_de_db(self.conn)
                cargar()
                if hasattr(self, "_agenda_refresh_completo"):
                    self._agenda_refresh_completo()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"{e}", parent=pop)

        botones = tk.Frame(pop)
        botones.pack(pady=10)
        ttk.Button(botones, text="➕ Agregar", command=agregar).pack(side="left", padx=5)
        ttk.Button(botones, text="🗑️ Borrar seleccionado", command=borrar).pack(side="left", padx=5)
        ttk.Button(botones, text="Cerrar", command=pop.destroy).pack(side="left", padx=5)
    # ──────────────────────────────────────────────────────────
    # 📝 PANEL EDITAR PLANTILLA DEL DECRETO (admin)
    # ──────────────────────────────────────────────────────────
    def _agenda_get_plantilla_decreto(self, tipo=None):
        """Busca la plantilla específica para el 'tipo'. Si no existe, usa la general."""
        try:
            cur = self.conn.cursor()
            # 1. Buscar plantilla específica
            if tipo:
                clave_especifica = f"plantilla_decreto_{tipo}"
                cur.execute("SELECT valor FROM configuracion WHERE clave=?", (clave_especifica,))
                row = cur.fetchone()
                if row and row[0].strip():
                    return row[0]
                    
            # 2. Buscar plantilla general de la base de datos
            cur.execute("SELECT valor FROM configuracion WHERE clave='plantilla_decreto'")
            row = cur.fetchone()
            if row and row[0].strip():
                return row[0]
        except Exception:
            pass
            
        # 3. Fallback final al hardcodeado
        return DECRETO_DEFAULT

    def panel_plantilla_decreto(self):
        if self.rol_actual != "admin":
            messagebox.showerror("Acceso denegado", "Solo administradores.")
            return
        pop = tk.Toplevel(self.root)
        pop.title("📝 Editar plantillas de decretos")
        pop.geometry("720x580") # Hacemos la ventana un poco más alta
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text="Plantillas de decretos automáticos",
                 font=("Segoe UI", 12, "bold")).pack(pady=10)

        # 🌟 NUEVO: Selector de tipo de plantilla
        frame_selector = tk.Frame(pop)
        frame_selector.pack(pady=5, padx=15, fill="x")
        
        tk.Label(frame_selector, text="Seleccione qué plantilla editar:", 
                 font=("Segoe UI", 9, "bold")).pack(side="left", padx=5)

        opciones_plantillas = ["Plantilla General (Por defecto)"] + TIPOS_AGENDA_TODOS
        combo_plantilla = ttk.Combobox(frame_selector, values=opciones_plantillas, state="readonly", width=40)
        combo_plantilla.set("Plantilla General (Por defecto)")
        combo_plantilla.pack(side="left", padx=5)

        info = ("Variables disponibles (se reemplazan al copiar):\n"
                "  {expte}        →  número de expediente\n"
                "  {tipo}         →  tipo de acto (audiencia de debate, etc.)\n"
                "  {fecha_larga}  →  24 de junio de 2026\n"
                "  {hora}         →  09:00\n"
                "  {descripcion}  →  texto libre cargado en el evento")
        tk.Label(pop, text=info, font=("Consolas", 9), justify="left",
                 bg="#FFFAE6", relief="groove", bd=1, padx=8, pady=5
                 ).pack(padx=15, fill="x", pady=5)

        txt = tk.Text(pop, font=("Segoe UI", 10), wrap="word", height=12)
        txt.pack(padx=15, pady=5, fill="both", expand=True)

        # 🌟 NUEVO: Lógica para cargar el texto al cambiar el combo
        def cargar_texto_combo(event=None):
            seleccion = combo_plantilla.get()
            tipo_bd = None if seleccion == "Plantilla General (Por defecto)" else seleccion
            txt.delete("1.0", "end")
            txt.insert("1.0", self._agenda_get_plantilla_decreto(tipo=tipo_bd))

        combo_plantilla.bind("<<ComboboxSelected>>", cargar_texto_combo)
        cargar_texto_combo() # Carga inicial

        botones = tk.Frame(pop)
        botones.pack(pady=10)

        def guardar():
            seleccion = combo_plantilla.get()
            # Si es la general usa la clave original, si es específica le agrega el tipo
            clave_bd = "plantilla_decreto" if seleccion == "Plantilla General (Por defecto)" else f"plantilla_decreto_{seleccion}"
            nueva = txt.get("1.0", "end").strip()
            
            try:
                self._begin_exclusive()
                cur = self.conn.cursor()
                # Guarda en la DB (Si la clave ya existe, la pisa. Si no, la crea)
                cur.execute("""INSERT INTO configuracion (clave, valor)
                               VALUES (?, ?)
                               ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor""",
                            (clave_bd, nueva))
                registrar_auditoria(self.conn, 0, "PLANTILLA_DECRETO_MODIFICADA",
                                    "valor", seleccion, "(actualizada)", self.usuario_actual)
                self._commit_y_sync()
                messagebox.showinfo("Éxito", f"Plantilla guardada para:\n{seleccion}", parent=pop)
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"{e}", parent=pop)

        def restaurar():
            if messagebox.askyesno("Confirmar",
                                    "¿Restaurar la plantilla de texto por defecto en la vista actual?", parent=pop):
                txt.delete("1.0", "end")
                txt.insert("1.0", DECRETO_DEFAULT)

        ttk.Button(botones, text="💾 Guardar", command=guardar).pack(side="left", padx=5)
        ttk.Button(botones, text="↺ Restaurar default", command=restaurar).pack(side="left", padx=5)
        ttk.Button(botones, text="Cerrar", command=pop.destroy).pack(side="left", padx=5)
    # ──────────────────────────────────────────────────────────
    # CAMBIAR PASSWORD PROPIO
    # ──────────────────────────────────────────────────────────
    def cambiar_password(self):
        pop = tk.Toplevel(self.root)
        pop.title("Cambiar Contraseña")
        self._centrar_popup(pop, 300, 260)

        tk.Label(pop, text="Contraseña Actual:", font=("Segoe UI", 10)).pack(pady=5)
        ent_actual = ttk.Entry(pop, show="*")
        ent_actual.pack(pady=2)

        tk.Label(pop, text="Nueva Contraseña:", font=("Segoe UI", 10)).pack(pady=5)
        ent_nueva = ttk.Entry(pop, show="*")
        ent_nueva.pack(pady=2)

        tk.Label(pop, text="Repetir Nueva:", font=("Segoe UI", 10)).pack(pady=5)
        ent_rep = ttk.Entry(pop, show="*")
        ent_rep.pack(pady=2)

        def guardar_pass():
            actual = ent_actual.get()
            nueva = ent_nueva.get()
            rep = ent_rep.get()
            cursor = self.conn.cursor()
            cursor.execute("SELECT password FROM usuarios WHERE nombre = ?", (self.usuario_actual,))
            bd_pass = cursor.fetchone()[0]
            if actual != bd_pass:
                messagebox.showerror("Error", "Contraseña actual incorrecta.", parent=pop)
                return
            if nueva != rep:
                messagebox.showerror("Error", "Las nuevas no coinciden.", parent=pop)
                return
            if len(nueva) < 4:
                messagebox.showwarning("Atención", "Mínimo 4 caracteres.", parent=pop)
                return
            cursor.execute("UPDATE usuarios SET password = ? WHERE nombre = ?", (nueva, self.usuario_actual))
            self._commit_y_sync()
            messagebox.showinfo("Éxito", "¡Contraseña actualizada!", parent=pop)
            pop.destroy()

        ttk.Button(pop, text="Guardar", command=guardar_pass).pack(pady=15)

    # ──────────────────────────────────────────────────────────
    # TOGGLE REMITIDO (marcar/desmarcar como enviado)
    # ──────────────────────────────────────────────────────────
    def toggle_remitido(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro para marcar como remitido.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT COALESCE(remitido, 0), tipo, numero FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        estado_actual, tipo_doc, num_doc = row

        # 🌟 BLOQUEO DE SEGURIDAD PARA EL BUSCADOR GLOBAL
        if tipo_doc != "OFICIO":
            messagebox.showwarning("Atención", "La función de Remitido es exclusiva para OFICIOS.")
            return

        if estado_actual:
            # Ya está marcado → desmarcar
            if messagebox.askyesno("Desmarcar", f"¿Quitar marca de REMITIDO de {tipo_doc} N° {num_doc}?"):
                try:
                    self._begin_exclusive()
                    cursor.execute("UPDATE registros SET remitido = 0, remitido_por = '', remitido_fecha = '' WHERE id = ?", (id_registro,))
                    registrar_auditoria(self.conn, id_registro, "DESMARCAR_REMITIDO", "remitido",
                                        "REMITIDO", "NO REMITIDO", self.usuario_actual)
                    self._commit_y_sync()
                    for funcion in self.funciones_actualizar:
                        funcion()
                except Exception as e:
                    self._safe_rollback()
                    messagebox.showerror("Error", f"Fallo:\n{e}")
        else:
            # No está marcado → marcar
            ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            try:
                self._begin_exclusive()
                cursor.execute("UPDATE registros SET remitido = 1, remitido_por = ?, remitido_fecha = ? WHERE id = ?",
                               (self.usuario_actual, ahora, id_registro))
                registrar_auditoria(self.conn, id_registro, "MARCAR_REMITIDO", "remitido",
                                    "NO REMITIDO", f"REMITIDO por {self.usuario_actual}", self.usuario_actual)
                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")

    # ──────────────────────────────────────────────────────────
    # MODIFICAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def modificar_registro(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT expediente, detalle, usuario, tipo, numero FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        expte_actual, detalle_actual, creador_doc, tipo_doc, num_doc = row

        if self.rol_actual != "admin" and str(self.usuario_actual) != str(creador_doc):
            messagebox.showerror("Acceso Denegado",
                                 f"Documento creado por: {creador_doc}\nSolo podés modificar tus registros.")
            return

        pop = tk.Toplevel(self.root)
        pop.title(f"Modificar {tipo_doc} N° {num_doc}")
        pop.geometry("450x250")
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text=f"Corrigiendo {tipo_doc} N° {num_doc}", font=("Segoe UI", 12, "bold")).pack(pady=10)

        frame_inputs = tk.Frame(pop)
        frame_inputs.pack(pady=5)

        tk.Label(frame_inputs, text="Expte Nro:").grid(row=0, column=0, sticky="e", pady=5)
        ent_expte = ttk.Entry(frame_inputs, width=35)
        ent_expte.insert(0, expte_actual)
        ent_expte.grid(row=0, column=1, padx=5, pady=5)

        tk.Label(frame_inputs, text="Detalle:").grid(row=1, column=0, sticky="e", pady=5)
        ent_detalle = ttk.Entry(frame_inputs, width=45)
        ent_detalle.insert(0, detalle_actual)
        ent_detalle.grid(row=1, column=1, padx=5, pady=5)

        def guardar_cambios():
            nuevo_expte = ent_expte.get().strip()
            nuevo_detalle = ent_detalle.get().strip().title()
            if not nuevo_expte:
                messagebox.showwarning("Atención", "Expediente no puede estar vacío.", parent=pop)
                return
            try:
                self._begin_exclusive()
                c = self.conn.cursor()
                c.execute("UPDATE registros SET expediente = ?, detalle = ? WHERE id = ?",
                          (nuevo_expte, nuevo_detalle, id_registro))

                # 📋 AUDITORÍA de la modificación
                if nuevo_expte != expte_actual:
                    registrar_auditoria(self.conn, id_registro, "MODIFICACION", "expediente",
                                        expte_actual, nuevo_expte, self.usuario_actual)
                if nuevo_detalle != detalle_actual:
                    registrar_auditoria(self.conn, id_registro, "MODIFICACION", "detalle",
                                        detalle_actual, nuevo_detalle, self.usuario_actual)

                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro modificado.", parent=pop)
                pop.destroy()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}", parent=pop)

        ttk.Button(pop, text="💾 Guardar Cambios", command=guardar_cambios).pack(pady=15)

    # ──────────────────────────────────────────────────────────
    # ANULAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def anular_registro(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT usuario, tipo, numero, expediente, detalle FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        creador_doc, tipo_doc, num_doc, expte_ant, detalle_ant = row

        if self.rol_actual != "admin" and str(self.usuario_actual) != str(creador_doc):
            messagebox.showerror("Acceso Denegado",
                                 f"Documento creado por: {creador_doc}\nSolo podés anular tus registros.")
            return

        if messagebox.askyesno("Confirmar Anulación",
                               f"¿ANULAR {tipo_doc} N° {num_doc} (ID {id_registro})?\n\nQuedará marcado como ANULADO."):
            try:
                self._begin_exclusive()
                cursor = self.conn.cursor()
                cursor.execute("UPDATE registros SET expediente = 'ANULADO', detalle = ? WHERE id = ?",
                               (f"Anulado por {self.usuario_actual}", id_registro))

                registrar_auditoria(self.conn, id_registro, "ANULACION", "expediente",
                                    expte_ant, "ANULADO", self.usuario_actual)

                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro ANULADO.")
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")

    # ──────────────────────────────────────────────────────────
    # BORRAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def borrar_registro(self, tree):
        if self.rol_actual != "admin":
            messagebox.showerror("Acceso Denegado", "Solo admins pueden borrar. Use ANULAR.")
            return

        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT numero, tipo, expediente, detalle FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        num_doc, tipo_doc, expte, detalle = row

        if messagebox.askyesno("⚠️ Borrado Físico",
                               f"¿BORRAR DEFINITIVAMENTE {tipo_doc} N° {num_doc} (ID {id_registro})?\n\nDejará hueco en la numeración."):
            try:
                self._begin_exclusive()

                registrar_auditoria(self.conn, id_registro, "BORRADO", "registro_completo",
                                    f"{tipo_doc} N°{num_doc} | {expte} | {detalle}", "ELIMINADO",
                                    self.usuario_actual)

                cursor = self.conn.cursor()
                cursor.execute("DELETE FROM registros WHERE id = ?", (id_registro,))
                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro borrado.")
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")


# ══════════════════════════════════════════════════════════════
# PANTALLA DE LOGIN
# ══════════════════════════════════════════════════════════════

class LoginScreen:
    def __init__(self, root):
        self.root = root
        self.root.title("Proteus — Acceso al Sistema de Numeración")
        self.root.geometry("400x330")
        self.root.configure(bg="#2C3E50")

        try:
            self.root.iconbitmap(ruta_recurso("icono.ico"))
        except Exception:
            pass

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after_idle(self.root.attributes, '-topmost', False)

        self.root.update_idletasks()
        width, height = 400, 330
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')

        # ── Encabezado visual ────────────────────────────────
        tk.Label(root, text="🏛️", font=("Segoe UI", 24), bg="#2C3E50").pack(pady=(8, 0))
        tk.Label(root, text="SISTEMA DE NUMERACIÓN", font=("Segoe UI", 14, "bold"),
                 bg="#2C3E50", fg="white").pack(pady=(0, 2))
        tk.Label(root, text="Juzgado Correccional — Charata", font=("Segoe UI", 9),
                 bg="#2C3E50", fg="#BDC3C7").pack(pady=(0, 5))

        # ── Formulario de login ──────────────────────────────
        form = tk.Frame(root, bg="#2C3E50")
        form.pack(pady=5)

        conn = conectar_db()
        cursor = conn.cursor()
        cursor.execute("SELECT nombre FROM usuarios ORDER BY nombre")
        lista_nombres = [fila[0] for fila in cursor.fetchall()]
        conn.close()

        tk.Label(form, text="Usuario:", bg="#2C3E50", fg="white", font=("Segoe UI", 10)).pack(pady=2)
        self.combo_usuarios = ttk.Combobox(form, values=lista_nombres, state="readonly", width=30)
        self.combo_usuarios.pack(pady=3)
        if lista_nombres:
            self.combo_usuarios.current(0)

        tk.Label(form, text="Contraseña:", bg="#2C3E50", fg="white", font=("Segoe UI", 10)).pack(pady=2)
        self.ent_password = ttk.Entry(form, show="*", width=33)
        self.ent_password.pack(pady=3)

        self.lbl_error = tk.Label(form, text="", fg="#E74C3C", bg="#2C3E50", font=("Segoe UI", 9))
        self.lbl_error.pack(pady=2)

        lbl_caps = tk.Label(form, text="", fg="#F1C40F", bg="#2C3E50", font=("Segoe UI", 9, "bold"))
        lbl_caps.pack()

        def verificar_caps(event):
            if event.state & 0x2:
                lbl_caps.config(text="⚠️ MAYÚSCULAS ACTIVADAS")
            else:
                lbl_caps.config(text="")

        self.ent_password.bind("<KeyPress>", verificar_caps)

        def ingresar(event=None):
            usuario_elegido = self.combo_usuarios.get()
            pwd_ingresada = self.ent_password.get()
            if not usuario_elegido:
                return

            try:
                conn = conectar_db()
                cursor = conn.cursor()
                cursor.execute("SELECT password, rol FROM usuarios WHERE nombre = ?", (usuario_elegido,))
                resultado = cursor.fetchone()

                if not resultado or pwd_ingresada != resultado[0]:
                    if not resultado:
                        self.lbl_error.config(text="❌ Usuario no encontrado")
                    else:
                        self.lbl_error.config(text="❌ Contraseña incorrecta")
                    conn.close()
                    return

                # Control de sesiones abiertas
                nombre_pc = socket.gethostname()
                cursor.execute("SELECT pc_name FROM sesiones WHERE usuario = ?", (usuario_elegido,))
                sesion_activa = cursor.fetchone()

                if sesion_activa and sesion_activa[0] != nombre_pc:
                    if not messagebox.askyesno("⚠️ Usuario en Uso",
                                                f"'{usuario_elegido}' está abierto en:\n\n💻 {sesion_activa[0]}\n\n¿Forzar ingreso?"):
                        conn.close()
                        return

                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("REPLACE INTO sesiones (usuario, pc_name, fecha_login) VALUES (?, ?, ?)",
                               (usuario_elegido, nombre_pc, ahora))
                conn.commit()
                conn.close()

                self.root.destroy()
                ventana_principal = tk.Tk()
                app = NumeradorApp(ventana_principal, usuario_elegido, resultado[1])
                ventana_principal.mainloop()

            except Exception as e:
                messagebox.showerror("Error al iniciar", f"Ocurrió un error grave:\n{e}")
        ttk.Button(form, text="🔑 Ingresar", command=ingresar).pack(pady=8)
        self.root.bind('<Return>', ingresar)


if __name__ == "__main__":
    root_login = tk.Tk()
    login = LoginScreen(root_login)
    root_login.mainloop()