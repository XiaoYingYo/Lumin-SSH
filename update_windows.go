//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
)

// launchInstaller 启动安装向导
func launchInstaller(targetPath string) error {
	cmd := exec.Command("cmd.exe", "/C", "start", "", targetPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start setup: %w", err)
	}
	return nil
}

// restartApp 重启应用（使用 start 命令确保完全脱离父进程）
func restartApp(exePath string) error {
	cmd := exec.Command("cmd.exe", "/C", "start", "", exePath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to restart application: %w", err)
	}
	return nil
}

// applyUpdateElevated 通过临时批处理提权替换便携版
func applyUpdateElevated(targetPath, exePath string) error {
	script := fmt.Sprintf(`@echo off
title Lumin Updater
tasklist /FI "PID eq %s" 2>NUL | find "%s" >NUL
:wait
ping -n 2 127.0.0.1 >NUL
tasklist /FI "PID eq %s" 2>NUL | find "%s" >NUL
if not errorlevel 1 goto wait
move /Y "%s" "%s" >NUL
if errorlevel 1 (
    echo Replace failed > "%%temp%%\Lumin-update-error.log"
    exit /b 1
)
start "" "%s"
del "%%~f0"`,
		strconv.Itoa(os.Getpid()), strconv.Itoa(os.Getpid()),
		strconv.Itoa(os.Getpid()), strconv.Itoa(os.Getpid()),
		targetPath, exePath, exePath)

	scriptPath := filepath.Join(os.TempDir(), "lumin-update.bat")
	if err := os.WriteFile(scriptPath, []byte(script), 0644); err != nil {
		return fmt.Errorf("failed to create updater script: %w", err)
	}

	// 以隐藏窗口方式启动批处理
	cmd := exec.Command("cmd.exe", "/C", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		os.Remove(scriptPath)
		return fmt.Errorf("failed to start updater script: %w", err)
	}
	return nil
}

// ponytail: Windows 平台 stubs — Linux 专属的更新路径不会走到
func installDebPackage(_ string) error    { return nil }
func installRpmPackage(_ string) error    { return nil }
func installDmgPackage(_, _ string) error { return nil }
