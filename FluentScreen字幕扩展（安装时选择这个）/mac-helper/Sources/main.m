#import <AppKit/AppKit.h>
#import <Vision/Vision.h>
#import <sys/socket.h>
#import <netinet/in.h>
#import <arpa/inet.h>
#import <unistd.h>
#import <signal.h>

static NSData *HTTPResponse(NSString *status, NSData *body) {
    NSString *headers = [NSString stringWithFormat:@"HTTP/1.1 %@\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: %lu\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n", status, (unsigned long)body.length];
    NSMutableData *result = [NSMutableData dataWithData:[headers dataUsingEncoding:NSUTF8StringEncoding]];
    [result appendData:body];
    return result;
}

static NSDictionary *Recognize(NSData *imageData, NSError **error) {
    NSImage *image = [[NSImage alloc] initWithData:imageData];
    CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
    if (!cgImage) {
        if (error) *error = [NSError errorWithDomain:@"FluentScreenVision" code:1 userInfo:@{NSLocalizedDescriptionKey:@"无法读取截图"}];
        return nil;
    }
    VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;
    request.recognitionLanguages = @[@"zh-Hans"];
    request.minimumTextHeight = 0.018;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
    if (![handler performRequests:@[request] error:error]) return nil;

    NSMutableArray *items = [NSMutableArray array];
    NSDictionary *best = nil;
    double bestScore = -1000;
    NSRegularExpression *chinese = [NSRegularExpression regularExpressionWithPattern:@"[\\u3400-\\u9FFF]" options:0 error:nil];
    for (VNRecognizedTextObservation *observation in request.results) {
        VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
        if (!candidate) continue;
        NSString *text = [[candidate.string stringByReplacingOccurrencesOfString:@"\n" withString:@""] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        if (!text.length) continue;
        CGRect box = observation.boundingBox;
        NSDictionary *item = @{ @"text":text, @"confidence":@(candidate.confidence), @"x":@(box.origin.x), @"y":@(box.origin.y), @"width":@(box.size.width), @"height":@(box.size.height) };
        [items addObject:item];
        BOOL hasChinese = [chinese firstMatchInString:text options:0 range:NSMakeRange(0, text.length)] != nil;
        if (!hasChinese) continue;
        double center = box.origin.x + box.size.width / 2.0;
        double score = candidate.confidence * 2.0 - fabs(center - 0.5) * 1.4 + box.size.width * 0.5;
        if (score > bestScore) { bestScore = score; best = item; }
    }
    return @{ @"text": best[@"text"] ?: @"", @"confidence": best[@"confidence"] ?: @0, @"candidates":items };
}

@interface LocalServer : NSObject
@property int socketFD;
- (BOOL)start:(NSError **)error;
@end

static BOOL ReadExact(int fd, void *buffer, size_t length) {
    size_t offset = 0;
    while (offset < length) {
        ssize_t count = read(fd, (char *)buffer + offset, length - offset);
        if (count <= 0) return NO;
        offset += (size_t)count;
    }
    return YES;
}

static void NativeMessagingLoop(void) {
    while (YES) {
        uint32_t length = 0;
        if (!ReadExact(STDIN_FILENO, &length, sizeof(length))) break;
        if (length > 1024 * 1024) break;
        NSMutableData *message = [NSMutableData dataWithLength:length];
        if (!ReadExact(STDIN_FILENO, message.mutableBytes, length)) break;
        NSData *reply = [@"{\"ok\":true,\"engine\":\"apple-vision\"}" dataUsingEncoding:NSUTF8StringEncoding];
        uint32_t replyLength = (uint32_t)reply.length;
        if (write(STDOUT_FILENO, &replyLength, sizeof(replyLength)) != sizeof(replyLength)) break;
        if (write(STDOUT_FILENO, reply.bytes, reply.length) != (ssize_t)reply.length) break;
    }
}

@implementation LocalServer
- (BOOL)start:(NSError **)error {
    self.socketFD = socket(AF_INET, SOCK_STREAM, 0);
    int yes = 1;
    setsockopt(self.socketFD, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    struct sockaddr_in address = {0};
    address.sin_family = AF_INET;
    address.sin_port = htons(8765);
    address.sin_addr.s_addr = inet_addr("127.0.0.1");
    if (bind(self.socketFD, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(self.socketFD, 8) != 0) {
        if (error) *error = [NSError errorWithDomain:@"FluentScreenVision" code:2 userInfo:@{NSLocalizedDescriptionKey:@"端口 8765 已被占用"}];
        return NO;
    }
    [NSThread detachNewThreadSelector:@selector(acceptLoop) toTarget:self withObject:nil];
    return YES;
}

- (void)acceptLoop {
    @autoreleasepool {
        while (YES) {
            int client = accept(self.socketFD, NULL, NULL);
            if (client >= 0) [NSThread detachNewThreadSelector:@selector(handleClientNumber:) toTarget:self withObject:@(client)];
        }
    }
}

- (void)handleClientNumber:(NSNumber *)number {
    @autoreleasepool {
        int client = number.intValue;
        NSMutableData *request = [NSMutableData data];
        char buffer[65536];
        NSRange separator = NSMakeRange(NSNotFound, 0);
        NSUInteger contentLength = 0;
        while (YES) {
            ssize_t count = recv(client, buffer, sizeof(buffer), 0);
            if (count <= 0) break;
            [request appendBytes:buffer length:(NSUInteger)count];
            if (separator.location == NSNotFound) {
                NSData *marker = [@"\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding];
                separator = [request rangeOfData:marker options:0 range:NSMakeRange(0, request.length)];
                if (separator.location != NSNotFound) {
                    NSString *headers = [[NSString alloc] initWithData:[request subdataWithRange:NSMakeRange(0, separator.location)] encoding:NSUTF8StringEncoding];
                    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"(?i)Content-Length:\\s*(\\d+)" options:0 error:nil];
                    NSTextCheckingResult *match = [regex firstMatchInString:headers options:0 range:NSMakeRange(0, headers.length)];
                    if (match) contentLength = [[headers substringWithRange:[match rangeAtIndex:1]] integerValue];
                }
            }
            if (separator.location != NSNotFound && request.length >= NSMaxRange(separator) + contentLength) break;
        }
        NSString *first = [[NSString alloc] initWithData:[request subdataWithRange:NSMakeRange(0, MIN(request.length, 100))] encoding:NSUTF8StringEncoding] ?: @"";
        NSData *response;
        if ([first hasPrefix:@"OPTIONS "]) {
            response = HTTPResponse(@"200 OK", [@"{}" dataUsingEncoding:NSUTF8StringEncoding]);
        } else if ([first hasPrefix:@"GET /health "]) {
            response = HTTPResponse(@"200 OK", [@"{\"ok\":true,\"engine\":\"apple-vision\"}" dataUsingEncoding:NSUTF8StringEncoding]);
        } else if ([first hasPrefix:@"POST /ocr "] && separator.location != NSNotFound) {
            NSUInteger start = NSMaxRange(separator), length = MIN(contentLength, request.length - start);
            NSError *error = nil;
            NSDictionary *result = Recognize([request subdataWithRange:NSMakeRange(start, length)], &error);
            NSData *json = [NSJSONSerialization dataWithJSONObject:result ?: @{ @"error":error.localizedDescription ?: @"识别失败" } options:0 error:nil];
            response = HTTPResponse(result ? @"200 OK" : @"422 Unprocessable Entity", json);
        } else {
            response = HTTPResponse(@"404 Not Found", [@"{\"error\":\"not found\"}" dataUsingEncoding:NSUTF8StringEncoding]);
        }
        send(client, response.bytes, response.length, 0);
        close(client);
    }
}
@end

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property NSWindow *window;
@property LocalServer *server;
@end


@implementation AppDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.server = [LocalServer new];
    NSTextField *label = [NSTextField labelWithString:@"FluentScreen Apple Vision\n\n本地中文字幕识别正在运行。\n请保持此程序开启，然后回到 Chrome 播放视频。\n\n所有截图仅在这台 Mac 上处理。"];
    label.alignment = NSTextAlignmentCenter;
    label.font = [NSFont systemFontOfSize:15];
    label.frame = NSMakeRect(25, 25, 390, 150);
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 440, 200) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"FluentScreen Vision";
    [self.window center];
    [self.window.contentView addSubview:label];
    [self.window makeKeyAndOrderFront:nil];
    NSError *error = nil;
    if (![self.server start:&error]) label.stringValue = [NSString stringWithFormat:@"无法启动本地识别服务：\n%@\n\n请关闭其他 FluentScreen Vision 后重试。", error.localizedDescription];
    [NSApp activateIgnoringOtherApps:YES];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        signal(SIGPIPE, SIG_IGN);
        BOOL nativeMode = argc > 1 && strstr(argv[1], "chrome-extension://") == argv[1];
        if (nativeMode) {
            LocalServer *server = [LocalServer new];
            NSError *error = nil;
            if (![server start:&error]) return 2;
            NativeMessagingLoop();
            return 0;
        }
        NSApplication *app = NSApplication.sharedApplication;
        AppDelegate *delegate = [AppDelegate new];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
