cmake_minimum_required(VERSION 3.25)

# The morph filter's wasm: cpp/abi.cpp over ivan-daw-engine-core's Filter.
# Built only with emscripten (scripts/build-wasm.mjs) and committed as prebuilt/morph-filter.wasm,
# so the DAW build and CI never need emsdk.
project(ivandaw_morph_filter LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "morph-filter builds only with emscripten: run `pnpm build:wasm` in plugins/morph-filter")
endif()

# Same pin as AxolotlPad, so the two filters are the same code.
# A local checkout instead: -DFETCHCONTENT_SOURCE_DIR_IVANDAW_ENGINE_CORE=<path>
include(FetchContent)
FetchContent_Declare(ivandaw_engine_core
    GIT_REPOSITORY https://github.com/zhirnovcodes/ivan-daw-engine-core.git
    GIT_TAG v0.1.0
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(ivandaw_engine_core)

add_executable(morph_filter cpp/abi.cpp)
target_link_libraries(morph_filter PRIVATE ivandaw::engine_core)
target_compile_options(morph_filter PRIVATE -fno-exceptions -fno-rtti -Wall -Wextra)
set_target_properties(morph_filter PROPERTIES
    OUTPUT_NAME "morph-filter"
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/prebuilt)
target_link_options(morph_filter PRIVATE
    -O2
    --no-entry
    -sSTANDALONE_WASM
    -sALLOW_MEMORY_GROWTH
    -sFILESYSTEM=0
    -sEXPORTED_FUNCTIONS=_mf_create,_mf_destroy,_mf_set,_mf_reset,_mf_left,_mf_right,_mf_process
)
