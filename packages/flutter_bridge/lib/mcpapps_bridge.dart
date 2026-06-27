import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/widgets.dart';

/// The JSON bridge exposed on `window.mcpappsHost` by the `mcpapps-host.js`
/// glue (which wraps @mcpapps/client-core). All payloads cross the JS<->Dart
/// boundary as JSON strings, keeping interop trivially typed.
@JS('mcpappsHost')
external _Host get _host;

extension type _Host(JSObject _) implements JSObject {
  external void ready();
  external String getToolResult();
  external String getTheme();
  external void onToolResult(JSFunction cb);
  external void onTheme(JSFunction cb);
  external JSPromise<JSString> callTool(String name, String argsJson);
}

/// Holds the latest tool result + theme and exposes `callTool`. Notifies
/// listeners (and therefore rebuilds dependent widgets) on every host update.
class McpAppController extends ChangeNotifier {
  Map<String, dynamic>? _result;
  String _colorScheme = 'light';

  Map<String, dynamic>? get result => _result;
  String get colorScheme => _colorScheme;

  McpAppController() {
    _result = _decodeResult(_host.getToolResult());
    _colorScheme = _decodeTheme(_host.getTheme());
    _host.onToolResult(
      ((JSString json) {
        _result = _decodeResult(json.toDart);
        notifyListeners();
      }).toJS,
    );
    _host.onTheme(
      ((JSString json) {
        _colorScheme = _decodeTheme(json.toDart);
        notifyListeners();
      }).toJS,
    );
  }

  /// Invoke a tool on the server and return its structured output.
  Future<Map<String, dynamic>?> callTool(String name, Map<String, dynamic> args) async {
    final res = await _host.callTool(name, jsonEncode(args)).toDart;
    return _decodeResult(res.toDart);
  }

  /// Tell the host the app has mounted (flushes the queued tool result).
  void ready() => _host.ready();

  Map<String, dynamic>? _decodeResult(String raw) {
    if (raw.isEmpty || raw == 'null') return null;
    final value = jsonDecode(raw);
    return value is Map<String, dynamic> ? value : null;
  }

  String _decodeTheme(String raw) {
    try {
      return (jsonDecode(raw) as Map)['colorScheme'] as String? ?? 'light';
    } catch (_) {
      return 'light';
    }
  }
}

/// Provides the [McpAppController] to the widget tree and rebuilds dependents
/// when it changes.
class McpAppScope extends InheritedNotifier<McpAppController> {
  const McpAppScope({
    super.key,
    required McpAppController controller,
    required super.child,
  }) : super(notifier: controller);
}

/// Entry point: read tool results, call tools, react to theme.
class McpApp {
  static McpAppController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<McpAppScope>();
    assert(scope?.notifier != null, 'McpAppScope not found — boot with runMcpApp().');
    return scope!.notifier!;
  }
}

/// Boot a Flutter MCP App component: wire the host bridge, mount [child], then
/// signal readiness so the host delivers the initial tool result.
void runMcpApp(Widget child) {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = McpAppController();
  runApp(McpAppScope(controller: controller, child: child));
  controller.ready();
}
