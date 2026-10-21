// Run through Electron to render the project-owned SVG; no image dependency or network.
const { createHash } = require("node:crypto");
const { app, BrowserWindow, nativeImage } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../apps/desktop/resources");
app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      show: false,
      width: 1024,
      height: 1024,
      useContentSize: true,
      transparent: true,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const svg = readFileSync(resolve(root, "icon.svg"), "utf8");
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)}`,
    );
    const image = await window.webContents.capturePage();
    // capturePage can use the display scale factor; normalize to physical pixels.
    const png = image.resize({ width: 1024, height: 1024 }).toPNG();
    writeFileSync(resolve(root, "icon.png"), png);
    const master = nativeImage.createFromBuffer(png);
    const resize = (size) => master.resize({ width: size, height: size, quality: "best" }).toPNG();
    const chunks = [
      ["icp4", 16],
      ["icp5", 32],
      ["icp6", 64],
      ["ic07", 128],
      ["ic08", 256],
      ["ic09", 512],
      ["ic10", 1024],
    ].map(([type, size]) => {
      const data = resize(size);
      const header = Buffer.alloc(8);
      header.write(type);
      header.writeUInt32BE(data.length + 8, 4);
      return Buffer.concat([header, data]);
    });
    const header = Buffer.alloc(8);
    header.write("icns");
    header.writeUInt32BE(8 + chunks.reduce((size, chunk) => size + chunk.length, 0), 4);
    writeFileSync(resolve(root, "icon.icns"), Buffer.concat([header, ...chunks]));
    const sizes = [16, 32, 48, 64, 128, 256];
    const images = sizes.map(resize);
    const directory = Buffer.alloc(6 + sizes.length * 16);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(sizes.length, 4);
    let offset = directory.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
      directory.writeUInt16LE(1, entry + 4);
      directory.writeUInt16LE(32, entry + 6);
      directory.writeUInt32LE(images[index].length, entry + 8);
      directory.writeUInt32LE(offset, entry + 12);
      offset += images[index].length;
    });
    writeFileSync(resolve(root, "icon.ico"), Buffer.concat([directory, ...images]));
    const manifest = Object.fromEntries(
      ["icon.svg", "icon.png", "icon.icns", "icon.ico"].map((name) => [
        name,
        createHash("sha256")
          .update(readFileSync(resolve(root, name)))
          .digest("hex"),
      ]),
    );
    writeFileSync(resolve(root, "icon-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
