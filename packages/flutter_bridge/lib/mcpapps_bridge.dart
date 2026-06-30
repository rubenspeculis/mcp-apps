import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

/// The JSON bridge exposed on `window.mcpappsHost` by the `mcpapps-host.js`
/// glue (which wraps @mcpapps/client-core). All payloads cross the JS<->Dart
/// boundary as JSON strings, keeping interop trivially typed.
@JS('mcpappsHost')
external _Host get _host;

extension type _Host(JSObject _) implements JSObject {
  external JSPromise<JSString> initialize();
  external void reportSize(int width, int height);
  external String getToolResult();
  external String getTheme();
  external void onToolResult(JSFunction cb);
  external void onTheme(JSFunction cb);
  external JSPromise<JSString> callTool(String name, String argsJson);
  external JSPromise<JSAny?> requestDisplayMode(String mode);
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
  Future<Map<String, dynamic>?> callTool(
    String name,
    Map<String, dynamic> args,
  ) async {
    final res = await _host.callTool(name, jsonEncode(args)).toDart;
    return _decodeResult(res.toDart);
  }

  /// Run the host handshake (`ui/initialize` → `initialized`), which unblocks
  /// the host's tool-result delivery and sizes the Flutter viewport.
  Future<void> initialize() async {
    await _host.initialize().toDart;
  }

  /// Report the rendered content size so a flexible host iframe can size to it.
  ///
  /// On Flutter Web this also asks the injected JS glue to resize the document
  /// viewport before it sends `ui/notifications/size-changed` to the host.
  void reportSize(int width, int height) => _host.reportSize(width, height);

  /// Ask the host to change display mode, for example `'fullscreen'` or `'inline'`.
  Future<void> requestDisplayMode(String mode) async {
    await _host.requestDisplayMode(mode).toDart;
  }

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

/// Builds the argument object sent to the backing tool for a proxied HTTP request.
typedef McpHttpArgumentsBuilder =
    FutureOr<Map<String, dynamic>> Function(
      http.BaseRequest request,
      Object? decodedBody,
    );

/// A small `package:http` client that proxies requests through a server tool.
///
/// This is useful inside `srcdoc`-rendered MCP App iframes where direct browser
/// fetch/XHR from Flutter Web can be blocked or hang due to the opaque origin.
/// Point an existing API client at this client, and implement [toolName] on your
/// MCP server to perform the real backend request server-side.
class McpAppHttpClient extends http.BaseClient {
  McpAppHttpClient(
    this.controller, {
    required this.toolName,
    this.argumentsBuilder,
    this.statusCode = 200,
    Map<String, String>? responseHeaders,
  }) : responseHeaders = {
         'content-type': 'application/json; charset=utf-8',
         ...?responseHeaders,
       };

  /// The app controller used to call the server tool.
  final McpAppController controller;

  /// The MCP tool that receives each decoded HTTP request body.
  final String toolName;

  /// Optional custom mapper from HTTP request + decoded body to tool arguments.
  ///
  /// By default, a JSON object body is passed through unchanged, an empty body
  /// becomes `{}`, and any non-object body is wrapped as `{ "body": value }`.
  final McpHttpArgumentsBuilder? argumentsBuilder;

  /// Status code exposed to the package:http caller when the tool succeeds.
  final int statusCode;

  /// Headers exposed to the package:http caller when the tool succeeds.
  final Map<String, String> responseHeaders;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final requestBytes = await request.finalize().toBytes();
    final decodedBody = _decodeHttpBody(requestBytes);
    final args = await _buildArguments(request, decodedBody);
    final result =
        await controller.callTool(toolName, args) ?? <String, dynamic>{};
    final responseBytes = utf8.encode(jsonEncode(result));

    return http.StreamedResponse(
      Stream<List<int>>.value(responseBytes),
      statusCode,
      contentLength: responseBytes.length,
      headers: responseHeaders,
      request: request,
    );
  }

  Future<Map<String, dynamic>> _buildArguments(
    http.BaseRequest request,
    Object? decodedBody,
  ) async {
    final custom = argumentsBuilder;
    if (custom != null) return await custom(request, decodedBody);
    return _defaultHttpArguments(decodedBody);
  }
}

/// Reports a Flutter component's scrollable content height to the MCP host.
///
/// Wrap tall Flutter content with this when it uses a vertical scrollable such
/// as [SingleChildScrollView]. The widget listens for [ScrollMetricsNotification]
/// and reports `maxScrollExtent + viewportDimension`, which lets the JS glue grow
/// the Flutter viewport instead of clipping at the default 480px height.
class McpAutoSize extends StatefulWidget {
  const McpAutoSize({
    super.key,
    required this.child,
    this.minHeight = 480,
    this.threshold = 4,
    this.growOnly = true,
  }) : assert(minHeight > 0),
       assert(threshold >= 0);

  /// The content to measure.
  final Widget child;

  /// Minimum reported height in CSS pixels.
  final int minHeight;

  /// Ignore width/height changes smaller than this many CSS pixels.
  final int threshold;

  /// Avoid shrinking after a larger height has been reported.
  ///
  /// Grow-only reports reduce resize feedback loops while Flutter is relaying out
  /// into the newly enlarged viewport. Set to `false` if your app must shrink.
  final bool growOnly;

  @override
  State<McpAutoSize> createState() => _McpAutoSizeState();
}

class _McpAutoSizeState extends State<McpAutoSize> {
  McpAppController? _controller;
  int? _lastHeight;
  int? _lastWidth;
  bool _initialReportPending = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller = McpApp.of(context);
    _scheduleViewportReport();
  }

  @override
  void didUpdateWidget(McpAutoSize oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.minHeight != widget.minHeight ||
        oldWidget.growOnly != widget.growOnly ||
        oldWidget.threshold != widget.threshold) {
      _scheduleViewportReport();
    }
  }

  @override
  Widget build(BuildContext context) {
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: _handleScrollMetrics,
      child: widget.child,
    );
  }

  bool _handleScrollMetrics(ScrollMetricsNotification notification) {
    final metrics = notification.metrics;
    if (metrics.axis != Axis.vertical) return false;

    final measuredHeight = metrics.maxScrollExtent + metrics.viewportDimension;
    if (measuredHeight.isFinite && measuredHeight > 0) {
      _reportHeight(measuredHeight.ceil());
    }
    return false;
  }

  void _scheduleViewportReport() {
    if (_initialReportPending) return;
    _initialReportPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initialReportPending = false;
      if (!mounted) return;
      final mediaSize = MediaQuery.maybeOf(context)?.size;
      final height = mediaSize?.height.isFinite == true
          ? mediaSize!.height.ceil()
          : 0;
      _reportHeight(height, width: mediaSize?.width.ceil());
    });
  }

  void _reportHeight(int measuredHeight, {int? width}) {
    final controller = _controller;
    if (controller == null) return;

    final nextWidth = width ?? _currentWidth();
    var nextHeight = math.max(widget.minHeight, measuredHeight);
    if (widget.growOnly && _lastHeight != null) {
      nextHeight = math.max(nextHeight, _lastHeight!);
    }

    final heightChanged =
        _lastHeight == null ||
        (nextHeight - _lastHeight!).abs() >= widget.threshold;
    final widthChanged =
        _lastWidth == null ||
        (nextWidth - _lastWidth!).abs() >= widget.threshold;
    if (!heightChanged && !widthChanged) return;

    _lastHeight = nextHeight;
    _lastWidth = nextWidth;
    controller.reportSize(nextWidth, nextHeight);
  }

  int _currentWidth() {
    final width = MediaQuery.maybeOf(context)?.size.width;
    if (width != null && width.isFinite && width > 0) return width.ceil();
    return 360;
  }
}

Object? _decodeHttpBody(List<int> bytes) {
  if (bytes.isEmpty) return null;
  final text = utf8.decode(bytes);
  if (text.trim().isEmpty) return null;
  try {
    return jsonDecode(text);
  } catch (_) {
    return text;
  }
}

Map<String, dynamic> _defaultHttpArguments(Object? decodedBody) {
  if (decodedBody == null) return <String, dynamic>{};
  if (decodedBody is Map<String, dynamic>) return decodedBody;
  if (decodedBody is Map) {
    return decodedBody.map((key, value) => MapEntry(key.toString(), value));
  }
  return <String, dynamic>{'body': decodedBody};
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
    assert(
      scope?.notifier != null,
      'McpAppScope not found — boot with runMcpApp().',
    );
    return scope!.notifier!;
  }
}

/// Boot a Flutter MCP App component: wire the host bridge, mount [child], then
/// run the host handshake so the host delivers the initial tool result and
/// sizes the (flexible) iframe.
void runMcpApp(Widget child) {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = McpAppController();
  runApp(McpAppScope(controller: controller, child: child));
  // Fire-and-forget: the JS glue sizes the viewport + reports size on resolve.
  controller.initialize();
}
