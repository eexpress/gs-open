const { GObject, GLib, Gio, Pango, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const debug = false;
//~ const debug = true;
function lg(s) {
	if (debug) log("===" + Me.metadata['gettext-domain'] + "===>" + s);
}

let lastclip = "";
let lazytext = ""; //不弹窗时，临时保存现场。

const Indicator = GObject.registerClass(
	class Indicator extends PanelMenu.Button {
		_init() {
			super._init(0.0, _(Me.metadata['name']));

			this.add_child(new St.Icon({ gicon : Gio.icon_new_for_string(Me.path + "/open-symbolic.svg") }));
			this.menu.connect('open-state-changed', (menu, open) => {
				if (open && this.mauto.state == false && lazytext.length > 3) { this.judge(lazytext); }
			});

			this.mauto = new PopupMenu.PopupSwitchMenuItem('', false);
			this.mauto.label.clutter_text.set_markup(_('▶ Auto pop menu').bold());
			this.menu.addMenuItem(this.mauto);

			this.mfile = new PopupMenu.PopupMenuItem('');
			this.mfile.file = '';
			this.mfile.reactive = false;
			this.menu.addMenuItem(this.mfile);
			this.markup();

			this._selection = global.display.get_selection();
			this._clipboard = St.Clipboard.get_default();
			this._ownerChangedId = this._selection.connect('owner-changed', () => {
				this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
					this.checknew(text);
				});
				this._clipboard.get_text(St.ClipboardType.PRIMARY, (clipboard, text) => {
					this.checknew(text);
				});
			});
		}

		checknew(text) {
			if (!text || text.length < 4) return;
			text = text.trim();
			if (text.indexOf("\n") > 0) return;
			if (text != lastclip) { // new clip
				lastclip = text;
				if (this.mauto.state)
					this.judge(lastclip);
				else
					lazytext = lastclip;
			}
		};

		judge(text) {
			lazytext = "";
			if (!this.add_menu(text)) {
				text = this.loc_file(text);
				if (text) this.add_menu(text);
			}
		}

		add_menu(text) {
			if (text.indexOf("~/") == 0) {
				text = GLib.getenv('HOME') + text.substr(1);
			}
			if (GLib.file_test(text, GLib.FileTest.IS_REGULAR | GLib.FileTest.IS_DIR)) {
				this.mfile.file = text;
				this.markup();
				this.menu._getMenuItems().forEach((j) => {if(j.cmd) j.destroy(); });
				this.get_context_menu(text);
				return true;
			}
			return false;
		};

		markup() {
			this.mfile.label.text = this.mfile.file;
			return;
			const a = this.mfile;
			if (!a.file) {
				a.label.text = "";
			} else {
				const head = a.file.split("/");
				const last = head.pop();
				let dir = head.join("/");
				if (dir.length > 0) dir += "/";
				a.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
				const pango = dir + last.bold().italics().fontcolor("#879CFF").replace(/font/g, "span");
				a.label.clutter_text.set_markup(pango);
			}
		}

		loc_file(str) { //找到两个的，就认为无效。
			if (str.charAt(str.length - 1) == '/') str = str.substr(0, str.length - 1);
			if (str.indexOf("/") > 0) { //`find` output
				// delete prefix '.'
				str = "*" + str.substr(str.indexOf(".") == 0 ? 1 : 0);
			} else { //`ls` output
				str = "*/" + str;
			}
			lg(str);

			let ret = GLib.spawn_command_line_sync(`locate -n 10 -w '${str}'`);
			if ((ret[0]) && (ret[3] == 0)) { // ok, exit_status = 0
				const lf = ByteArray.toString(ret[1]).split("\n");
				const lff = lf.filter(item => item.indexOf('/.') === -1 && item);
				lg(lff);
				if (lff.length == 1)
					return lff[0];
				else
					return null;
			}
			return null;
		};

		get_context_menu(text) {
			try {
				const contentType = this.get_content_type(text);
				const apps = Gio.AppInfo.get_recommended_for_type(contentType);
				if (apps) this.create_context_menu(text, apps);
			} catch (e) { lg(e); }
		}

		create_context_menu(text, apps) {
			apps.forEach((i) => {
				const ca = new PopupMenu.PopupImageMenuItem(i.get_display_name(), i.get_icon());
				ca.cmd = i.get_commandline();
				ca.connect('activate', (actor) => {
					let cmd = actor.cmd;
					const re = /\%[uUfF]/;
					cmd = cmd.replace(re, `"${text}"`);
					GLib.spawn_command_line_async(cmd);
				});
				this.menu.addMenuItem(ca);
			});
			if (this.mauto.state) this.menu.open();
		}

		get_content_type(str) {
			try {
				const f0 = Gio.File.new_for_path(str);
				const f1 = f0.query_info(Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE, Gio.FileQueryInfoFlags.NONE, null);
				const contentType = f1.get_content_type();
				return contentType;
			} catch (e) {
				lg(e);
				return null;
			}
		}

		destroy() {
			this._selection.disconnect(this._ownerChangedId);
			if (this._actor) this._actor.destroy();
			super.destroy();
		}
	});

class Extension {
	constructor(uuid) {
		this._uuid = uuid;

		ExtensionUtils.initTranslations();
	}

	enable() {
		lg("start");
		this._indicator = new Indicator();
		Main.panel.addToStatusArea(this._uuid, this._indicator);
	}

	disable() {
		lg("stop");
		this._indicator.destroy();
		this._indicator = null;
	}
}

function init(meta) {
	return new Extension(meta.uuid);
}
