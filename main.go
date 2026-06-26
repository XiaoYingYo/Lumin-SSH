package main

import (
	"context"
	"embed"
	"sync"
	"time"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// forceShowWindow 唤醒隐藏到托盘的窗口，带 recover 防止 panic 导致托盘 goroutine 挂死
func forceShowWindow(ctx context.Context) {
	defer func() { recover() }()
	runtime.WindowHide(ctx)
	runtime.WindowShow(ctx)
}

var systrayOnce sync.Once

func setupSystray(app *App) {
	systrayOnce.Do(func() {
		systray.SetIcon(icon)
		systray.SetTitle("Lumin")
		systray.SetTooltip("Lumin SSH")

		mShow := systray.AddMenuItem("显示主窗口", "Show Main Window")
		mQuit := systray.AddMenuItem("完全退出", "Quit Lumin")

		// 左键点击托盘图标：显示窗口
		systray.SetOnClick(func(menu systray.IMenu) {
			if app.ctx != nil {
				forceShowWindow(app.ctx)
			}
		})

		// 右键点击托盘图标：显示菜单
		systray.SetOnRClick(func(menu systray.IMenu) {
			menu.ShowMenu()
		})

		mShow.Click(func() {
			if app.ctx != nil {
				forceShowWindow(app.ctx)
			}
		})

		mQuit.Click(func() {
			app.DoQuit()
		})
	})
}

func main() {
	// 单实例检查（平台特定实现）
	ensureSingleInstance()

	// Create an instance of the app structure
	app := NewApp()

	// Setup systray
	onReady := func() {
		setupSystray(app)
	}
	onExit := func() {}

	// Run systray in background
	go systray.Run(onReady, onExit)

	// Create application with options
	opts := &options.App{
		Title:     "Lumin",
		Width:     1440,
		Height:    900,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 8, G: 12, B: 20, A: 255}, // #080c14
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
		},
		// 拦截窗口关闭：弹出对话框让用户选择退出 / 系统托盘 / 取消
		OnBeforeClose: func(ctx context.Context) bool {
			if app.quitting.Load() {
				return false // 用户确认退出，放行
			}
			runtime.EventsEmit(ctx, "close-request")
			// 超时兜底：如果前端 5 秒内没有响应（崩溃/JS 异常），强制允许关闭
			go func() {
				time.Sleep(5 * time.Second)
				if !app.quitting.Load() {
					app.quitting.Store(true)
					runtime.Quit(ctx)
				}
			}()
			return true // 取消关闭，由前端弹窗决定后续操作
		},
		Bind: []interface{}{
			app,
		},
	}

	// 应用平台特定选项（平台特定实现）
	applyPlatformOptions(opts)

	err := wails.Run(opts)

	if err != nil {
		println("Error:", err.Error())
	}
}
