# NetSentinel desktop shell

Electron wrapper around the shared `dashboard/` and `addon/` code.
Two build artifacts are needed in this order:

    cd ../dashboard && npm run build   # → dashboard/dist/
    cd ../desktop   && npm run dist    # rebuilds addon for Electron ABI,
                                       # then packages installer

The rebuild-addon step is required because Electron ships a different
Node ABI than the system `node`. Loading a .node built for the wrong
ABI fails with `NODE_MODULE_VERSION mismatch`.

## Runtime layout (packaged)

    resources/
      addon/netsentinel_addon_electron.node
      dashboard/index.html
      dashboard/assets/...
      app.asar                     (main.js, preload.js)

## Dev loop

    # one-time
    npm install

    # every time you change dashboard/
    cd ../dashboard && npm run build

    # every time you change addon/ or engine/ (C code)
    npm run rebuild-addon

    # launch
    ELECTRON_IS_DEV=1 npm start

## Permission notes

- Linux: the `.deb`'s postinst script runs setcap on the addon
  (packaging/linux/debian/postinst). Requires `setcap` at install
  time, which is present on every Debian/Ubuntu base.
- Windows: the NSIS installer requests elevation via
  requestedExecutionLevel=requireAdministrator.
- macOS: not yet wired. Requires SMJobBless + a privileged helper;
  see packaging/macos/README.md (out of scope for now).
