# binding.gyp
#
# Two build targets, identical sources, different ABIs:
#
#   netsentinel_addon            — built against the Node.js ABI
#                                  (used by server/, the CLI, tests)
#   netsentinel_addon_electron   — built against Electron's ABI
#                                  (used by desktop/main.js)
#
# Node.js and Electron ship different V8/Node versions with different
# NODE_MODULE_VERSION numbers. A .node built for one cannot be loaded
# by the other; you get "was compiled against a different Node.js version".
# Building both targets lets both runtimes coexist in one repo.
#
# The sources list is factored out so the two targets can never drift.

{
  "variables": {
    # JSON has no comment-safe array references, so we duplicate the list
    # in both targets below and keep them in sync manually. If you add a
    # new .cpp/.c file, add it to BOTH targets.
  },

  "targets": [
    {
      "target_name": "netsentinel_addon",
      "sources": [
        "addon/src/addon.cpp",
        "addon/src/capture_manager.cpp",
        "addon/src/stats_publisher.cpp",
        "engine/src/capture.c",
        "engine/src/parser.c",
        "engine/src/stats.c",
        "engine/src/util.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "engine/src",
        "addon/src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags": [
        "-std=c11",
        "-Wall", "-Wextra", "-Wshadow", "-Wconversion",
        "-O2", "-g",
        "-pthread",
        "-D_GNU_SOURCE"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-Wall", "-Wextra", "-Wconversion",
        "-O2", "-g", "-pthread", "-D_GNU_SOURCE"
      ],
      "cflags!": [ "-fno-exceptions", "-std=c11" ],
      "cflags_cc!": [ "-fno-exceptions", "-std=c11" ],
      "ldflags": [ "-pthread" ]
    },

    {
      # Same sources, different ABI. The output file is
      # build/Release/netsentinel_addon_electron.node.
      #
      # Built with:
      #   npx node-gyp rebuild \
      #     --target="$(npx electron --version | tr -d v)" \
      #     --dist-url=https://electronjs.org/headers
      #
      # That second command overwrites BOTH targets' output with the
      # Electron-ABI build. To restore the web build afterwards, run:
      #   npx node-gyp rebuild
      # See desktop/README.md for the full build/test loop.
      "target_name": "netsentinel_addon_electron",
      "sources": [
        "addon/src/addon.cpp",
        "addon/src/capture_manager.cpp",
        "addon/src/stats_publisher.cpp",
        "engine/src/capture.c",
        "engine/src/parser.c",
        "engine/src/stats.c",
        "engine/src/util.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "engine/src",
        "addon/src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags": [
        "-std=c11",
        "-Wall", "-Wextra", "-Wshadow", "-Wconversion",
        "-O2", "-g",
        "-pthread",
        "-D_GNU_SOURCE"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-Wall", "-Wextra", "-Wconversion",
        "-O2", "-g", "-pthread", "-D_GNU_SOURCE"
      ],
      "cflags!": [ "-fno-exceptions", "-std=c11" ],
      "cflags_cc!": [ "-fno-exceptions", "-std=c11" ],
      "ldflags": [ "-pthread" ]
    }
  ]
}