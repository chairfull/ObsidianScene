const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
	sceneW: 1920,
	sceneH: 1080,
	defaultFont: "",
	titleSize: 192,
	subtitleSize: 96,
};

module.exports = class CanvasPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CanvasSettingTab(this.app, this));

		this.imgLoadCache = new Map();
		this.imgSizeCache = new Map();

		this.registerProcessor("scene_full", "100%");
		this.registerProcessor("scene_full_spoiler", "100%");

		this.registerProcessor("scene", "49.5%");
		this.registerProcessor("scene_spoiler", "49.5%");
		this.registerProcessor("scene_right", "49.5%");
		this.registerProcessor("scene_right_spoiler", "49.5%");
		this.registerProcessor("scene_center", "49.5%");
		this.registerProcessor("scene_center_spoiler", "49.5%");

		this.registerProcessor("scene_small", "32.5%");
		this.registerProcessor("scene_small_spoiler", "32.5%");
		this.registerProcessor("scene_small_right", "32.5%");
		this.registerProcessor("scene_small_right_spoiler", "32.5%");
		this.registerProcessor("scene_small_center", "32.5%");
		this.registerProcessor("scene_small_center_spoiler", "32.5%");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	registerProcessor(tag, size) {
		this.registerMarkdownCodeBlockProcessor(tag, async (source, el, ctx) => {
			const sceneW = this.settings.sceneW;
			const sceneH = this.settings.sceneH;

			const clearDiv = document.createElement('div');
			clearDiv.style.clear = 'both';
			el.appendChild(clearDiv);

			const container = document.createElement('div');
			Object.assign(container.style, {
				width: size,
				overflow: 'hidden',
				position: 'relative',
				background: '#222',
				padding: '0',
				margin: '0',
				lineHeight: '0',
			});
			el.appendChild(container);

			if (tag.endsWith("_spoiler")) container.classList.add('canvas-spoiler');

			if (tag.includes("_left") || tag === "scene" || tag === "scene_spoiler") {
				container.style.cssFloat = 'left';
				container.style.marginRight = '1em';
			} else if (tag.includes("_right")) {
				container.style.cssFloat = 'right';
				container.style.marginLeft = '1em';
			} else {
				container.style.margin = '1em auto';
				container.style.display = 'block';
			}

			const canvas = document.createElement('canvas');
			canvas.width = sceneW;
			canvas.height = sceneH;
			Object.assign(canvas.style, {
				display: 'block',
				transformOrigin: 'top left',
				margin: '0',
				padding: '0',
			});
			container.appendChild(canvas);
			const ctx2d = canvas.getContext('2d');

			const getArgKwargs = (line) => {
				const regex = /"([^"]+)"|\[([^\]]+)\]|(\S+)/g;
				const tokens = [];
				const outArgs = [];
				const outKwargs = {};
				let match;
				while ((match = regex.exec(line)) !== null) {
					if (match[1]) tokens.push(match[1]);
					else if (match[2]) tokens.push(`[${match[2]}]`);
					else tokens.push(match[3]);
				}
				for (const pair of tokens) {
					if (pair.includes(":")) {
						const [key, value] = pair.split(":");
						if (key) outKwargs[key] = value;
					} else {
						outArgs.push(pair);
					}
				}
				return [outArgs, outKwargs];
			};

			const supportedExtensions = [".webp", ".png", ".jpg", ".jpeg"];

			const resolveImagePath = async id => {
				if (this.imagePathCache?.has(id)) return this.imagePathCache.get(id);

				for (const ext of supportedExtensions) {
					const path = `gfx/${id}${ext}`;
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file) {
						this.imagePathCache ??= new Map();
						this.imagePathCache.set(id, file.path);
						return file.path;
					}
				}
				return null;
			};

			const loadImage = async path => {
				if (this.imgLoadCache.has(path)) return this.imgLoadCache.get(path);
				const p = (async () => {
					const img = new Image();
					img.src = this.app.vault.adapter.getResourcePath(path);
					await img.decode();
					this.imgSizeCache.set(path, { w: img.width, h: img.height });
					return img;
				})();
				this.imgLoadCache.set(path, p);
				return p;
			};

			const drawImage = async (id, state) => {
				const fullPath = await resolveImagePath.call(this, id);
				if (!fullPath) return;
				const img = await loadImage.call(this, fullPath);
				const { w, h } = this.imgSizeCache.get(fullPath);
				ctx2d.save();
				ctx2d.translate(sceneW * state.pos.x, sceneH * state.pos.y);
				ctx2d.scale(state.scale.x, state.scale.y);
				ctx2d.drawImage(img, -w * state.anchor.x, -h * state.anchor.y, w, h);
				ctx2d.restore();
			};

			const drawText = (txt, data) => {
				let x = sceneW * data.pos.x;
				let y = sceneH * data.pos.y;
				if (this.settings.defaultFont)
					ctx2d.font = `${data.size}px "${this.settings.defaultFont}", sans-serif`;
				else
					ctx2d.font = `${data.size}px sans-serif`;
				if (data.bold) ctx2d.font = "bold " + ctx2d.font;
				if (data.italic) ctx2d.font = "italic " + ctx2d.font;
				ctx2d.fillStyle = '#ffffff';
				ctx2d.textAlign = data.align;
				if (data.baseline) ctx2d.textBaseline = data.baseline;

				ctx2d.lineJoin = 'round';
				ctx2d.miterLimit = 4;
				ctx2d.lineWidth = 12;
				ctx2d.strokeStyle = '#242424';
				ctx2d.strokeText(txt, x, y);

				const grad = ctx2d.createLinearGradient(x, y - 20, x, y + 20);
				grad.addColorStop(0, '#ffffff');
				grad.addColorStop(1, '#e6e6e6');
				ctx2d.fillStyle = grad;
				ctx2d.fillText(txt, x, y);

				ctx2d.shadowColor = 'rgba(0,0,0,0.25)';
				ctx2d.shadowBlur = 2;
				ctx2d.shadowOffsetX = 1;
				ctx2d.shadowOffsetY = 2;
				ctx2d.fillText(txt, x, y);

				ctx2d.shadowColor = 'transparent';
			};

			const drawFiltered = (filterStr, pixels = 0) => {
				const imageData = ctx2d.getImageData(0, 0, sceneW, sceneH);
				let temp, tctx;

				if (pixels > 0) {
					temp = document.createElement('canvas');
					temp.width = sceneW + pixels * 2;
					temp.height = sceneH + pixels * 2;
					tctx = temp.getContext('2d');

					tctx.putImageData(imageData, pixels, pixels);

					tctx.drawImage(temp, pixels, pixels, 1, sceneH, 0, pixels, pixels, sceneH);
					tctx.drawImage(temp, pixels + sceneW - 1, pixels, 1, sceneH, pixels + sceneW, pixels, pixels, sceneH);
					tctx.drawImage(temp, pixels, pixels, sceneW, 1, pixels, 0, sceneW, pixels);
					tctx.drawImage(temp, pixels, pixels + sceneH - 1, sceneW, 1, pixels, pixels + sceneH, sceneW, pixels);

					tctx.filter = filterStr;
					tctx.drawImage(temp, 0, 0);

					ctx2d.clearRect(0, 0, sceneW, sceneH);
					ctx2d.drawImage(temp, pixels, pixels, sceneW, sceneH, 0, 0, sceneW, sceneH);
				} else {
					ctx2d.filter = filterStr;
					ctx2d.drawImage(canvas, 0, 0);
				}

				return temp;
			};

			const drawScene = async () => {
				ctx2d.clearRect(0, 0, sceneW, sceneH);

				// example circle
				ctx2d.fillStyle = '#00ffff';
				ctx2d.beginPath();
				ctx2d.arc(sceneW/2, sceneH/2, 100, 0, 2 * Math.PI);
				ctx2d.fill();

				const lines = source.trim().split(/[\r\n&]+/);
				let title, titleArgs, titleKwargs
				let subtitle, subtitleArgs, subtitleKwargs
				let temp
				for (const line of lines) {
					if (!line.trim() || line.includes("%%")) continue;
					const [headArgs, kwargs] = getArgKwargs(line.trim())
					const [cmd, ...args] = headArgs
					switch (cmd) {
						case 'TITLE':
						case 'T':
							title = args[0];
							titleArgs = args;
							titleKwargs = kwargs;
							break;
						case 'SUBTITLE':
						case 'S':
							subtitle = args[0];
							subtitleArgs = args;
							subtitleKwargs = kwargs;
							break;
						case 'DARK':
							ctx2d.fillStyle = `rgba(0, 0, 0, ${parseFloat(kwargs?.amount ?? 0.5)})`;
							ctx2d.fillRect(0, 0, sceneW, sceneH);
							break;
						case 'LIGHT':
							ctx2d.fillStyle = `rgba(1, 1, 1, ${parseFloat(kwargs?.amount ?? 0.5)})`;
							ctx2d.fillRect(0, 0, sceneW, sceneH);
							break;
						case 'BLUR':
							let pixels = parseInt(kwargs?.pixels ?? 8)
							let filter = `blur(${pixels}px)`
							for (const arg of args) {
								switch (arg) {
									case 'DARK': filter += " brightness(0.5)"; break;
									case 'DARKER': filter += " brightness(0.25)"; break;
									case 'LIGHT': filter += " brightness(1.5)"; break;
									case 'LIGHTER': filter += " brightness(1.8)"; break;
									case 'DESAT': filter += " saturate(0.5)"; break;
									case 'SAT': filter += " saturate(1.5)"; break;
								}
							}
							drawFiltered(filter, pixels);
							break;
						case 'BLOOM':
							temp = drawFiltered(`blur(${parseInt(kwargs?.pixels ?? 8)}px)`);
							ctx2d.save();
							ctx2d.globalAlpha = parseFloat(kwargs?.alpha ?? "0.5");
							ctx2d.globalCompositeOperation = 'lighter';
							ctx2d.drawImage(temp, 0, 0);
							ctx2d.restore();
							break;
						// case 'ROTATE':
						// 	temp = document.createElement('canvas');
						// 	temp.width = baseW;
						// 	temp.height = baseH;
						// 	temp.getContext('2d').drawImage(canvas, 0, 0);
      //
						// 	// Clear main canvas
						// 	ctx2d.clearRect(0, 0, baseW, baseH);
						// 	let degrees = 15;
						// 	// Rotate around center
						// 	ctx2d.save();
						// 	ctx2d.translate(baseW / 2, baseH / 2); // move origin to center
						// 	ctx2d.rotate(degrees * Math.PI / 180);         // apply rotation
						// 	ctx2d.translate(-baseW / 2, -baseH / 2); // move origin back
						// 	ctx2d.drawImage(temp, 0, 0);
						// 	ctx2d.restore();
						// 	break;
						case 'ZOOM':
							const zoom = parseFloat(kwargs?.zoom ?? 2.0);
							const angle = (parseFloat(kwargs?.degrees ?? 0.0)) * Math.PI / 180;
							const xpos = parseFloat(kwargs?.xpos ?? 0.5);
							const ypos = parseFloat(kwargs?.ypos ?? 0.5);
							const sw = sceneW / zoom;
							const sh = sceneH / zoom;

							const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
							const cx = clamp(sceneW * xpos, sw / 2, sceneW - sw / 2);
							const cy = clamp(sceneH * ypos, sh / 2, sceneH - sh / 2);

							const sx = cx - sw / 2;
							const sy = cy - sh / 2;

							// Copy canvas
							const temp = document.createElement('canvas');
							temp.width = sceneW;
							temp.height = sceneH;
							temp.getContext('2d').drawImage(canvas, 0, 0);

							// Apply transform
							ctx2d.clearRect(0, 0, sceneW, sceneH);
							ctx2d.save();

							// Move to center of canvas
							ctx2d.translate(sceneW / 2, sceneH / 2);
							// Apply rotation
							ctx2d.rotate(angle);
							// Apply zoom
							ctx2d.scale(zoom, zoom);
							// Move the zoom window to origin
							ctx2d.translate(-cx, -cy);

							// Draw the selected region
							ctx2d.drawImage(temp, 0, 0);
							ctx2d.restore();

							break;

						case 'GRAY':
						case 'GRAYSCALE':
							drawFiltered(`grayscale(${parseFloat(kwargs?.amount ?? 100)}%)`);
							break;
						case 'SEPIA':
							drawFiltered(`sepia(${parseFloat(kwargs?.amount ?? 100)}%)`);
							break;
						case 'INVERT':
							drawFiltered('invert(100%)');
							break;
						case 'HUE':
							drawFiltered(`hue-rotate(${parseFloat(kwargs?.amount ?? 90)}deg)`);
							break;
						default:
							let state = {
								anchor: {x: 0.5, y: 1.0},
								pos: {x: 0.5, y: 1.0 },
								scale: {x: 1.0, y: 1.0}
							}
							let path = [cmd]
							for (const arg of args) {
								switch (arg) {
									case "<":
										state.anchor.x = 0.0;
										state.pos.x = 0.0;
										break
									case ">":
										state.anchor.x = 0.0;
										state.pos.x = 1.0;
										state.scale.x = -1.0;
										break;
									case "FLIP":
										state.anchor.x = 1.0;
										state.scale.x *= -1.0;
										break;
									case "+": // True-Center.
										state.anchor.x = 0.5;
										state.anchor.y = 0.5;
										state.pos.x = 0.5;
										state.pos.y = 0.5;
										break;
									default:
										path.push(arg);
										break;
								}
							}
							let pathStr = path.join("/")
							await drawImage(`${pathStr}`, state);
							break;
					}
				}
				if (title) {
					let td = { size: this.settings.titleSize, align: "center", baseline: "center", pos: { x: 0.5, y: 0.5 }, bold: true }
					let sd = { size: this.settings.subtitleSize, align: "center", baseline: "center", pos: { x: 0.5, y: 0.5 }, bold: true }
					let matched = true;
					for (let arg of titleArgs) {
						switch (arg) {
							case "<": td.pos.x = 0.05; td.align = "left"; sd.pos.x = 0.05; sd.align = "left"; break;
							case ">": td.pos.x = 0.95; td.align = "right"; sd.pos.x = 0.95; sd.align = "right"; break;
							case "^": td.pos.y = 0.05; td.baseline = "top"; sd.pos.y = 0.05; sd.baseline = "top"; break;
							case "v": td.pos.y = 0.95; td.baseline = "bottom"; sd.pos.y = 0.95; sd.baseline = "bottom";
								if (subtitle) {
									td.pos.y = .9;
									sd.pos.y = .85;
								}
								break;
						}
					}

					if (subtitle) {
						for (let arg of subtitleArgs) {
							switch (arg) {
								case "<": matched = false; sd.pos.x = 0.05; sd.align = "left"; break;
								case ">": matched = false; sd.pos.x = 0.95; sd.align = "right"; break;
								case "^": matched = false; sd.pos.y = 0.05; sd.baseline = "top"; break;
								case "v": matched = false; sd.pos.y = 0.95; sd.baseline = "bottom"; break;
							}
						}
						if (matched) { sd.pos.y += .1; }
						drawText(title, td);
						drawText(subtitle, sd);
					} else {
						drawText(title, td);
					}
				} else if (subtitle) {
					drawText(subtitle, { size: this.settings.subtitleSize, });
				}
			};

			const resize = () => {
				const scale = container.clientWidth / sceneW;
				canvas.style.transform = `scale(${scale})`;
				container.style.height = `${Math.floor(sceneH * scale)}px`;
			};

			const observer = new ResizeObserver(resize);
			observer.observe(container);

			const scale = container.clientWidth / sceneW;
			canvas.style.transform = `scale(${scale})`;
			container.style.height = `${Math.floor(sceneH * scale)}px`;

			drawScene();

			el.onunload = () => {
				observer.disconnect();
			};
		});
	}
};

class CanvasSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Canvas Plugin Settings" });

		new Setting(containerEl)
			.setName("Scene Width")
			.setDesc("Default canvas width")
			.addText(text => text
				.setPlaceholder("1920")
				.setValue(this.plugin.settings.sceneW.toString())
				.onChange(async (value) => {
					this.plugin.settings.sceneW = parseInt(value) || 1920;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Scene Height")
			.setDesc("Default canvas height")
			.addText(text => text
				.setPlaceholder("1080")
				.setValue(this.plugin.settings.sceneH.toString())
				.onChange(async (value) => {
					this.plugin.settings.sceneH = parseInt(value) || 1080;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName("Default Font")
			.setDesc("A system font name to use for titles and subtitles.")
			.addText(text => text
				.setPlaceholder("")
				.setValue(this.plugin.settings.defaultFont)
				.onChange(async (value) => {
					this.plugin.settings.defaultFont = value || "";
					await this.plugin.saveSettings();
				})
			)
		new Setting(containerEl)
			.setName("Title Size")
			.setDesc("Default pixel size of titles.")
			.addText(text => text
				.setPlaceholder("192")
				.setValue(this.plugin.settings.titleSize.toString())
				.onChange(async (value) => {
					this.plugin.settings.titleSize = parseInt(value) || 192;
					await this.plugin.saveSettings();
				})
			)
		new Setting(containerEl)
			.setName("Subtitle Size")
			.setDesc("Default pixel size of subtitles.")
			.addText(text => text
				.setPlaceholder("96")
				.setValue(this.plugin.settings.subtitleSize.toString())
				.onChange(async (value) => {
					this.plugin.settings.subtitleSize = parseInt(value) || 96;
					await this.plugin.saveSettings();
				})
			)
	}
}
