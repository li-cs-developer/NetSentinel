{
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
    }
  ]
}