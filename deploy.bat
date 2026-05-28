@echo off
setlocal enabledelayedexpansion

:: ============================================
::  Docker 镜像构建与推送脚本
:: ============================================
:: 用法:
::   deploy.bat              — 使用默认版本 1.0.0
::   deploy.bat 1.2.3        — 指定版本号
:: ============================================

set IMAGE_NAME=mul-email
set DOCKER_USER=sunqz
set VERSION=%~1
if "%VERSION%"=="" set VERSION=1.0.0
set FULL_TAG=%DOCKER_USER%/%IMAGE_NAME%:%VERSION%

echo.
echo ============================================
echo  构建镜像: %IMAGE_NAME%:%VERSION%
echo ============================================
echo.

:: Step 1: 构建
docker build -t %IMAGE_NAME%:%VERSION% .
if errorlevel 1 (
    echo [ERROR] 构建失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo ============================================
echo  打标签: %FULL_TAG%
echo ============================================
echo.

:: Step 2: 打标签
docker tag %IMAGE_NAME%:%VERSION% %FULL_TAG%
if errorlevel 1 (
    echo [ERROR] 打标签失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo  推送镜像: %FULL_TAG%
echo ============================================
echo.

:: Step 3: 推送
docker push %FULL_TAG%
if errorlevel 1 (
    echo [ERROR] 推送失败，请检查是否已登录 Docker Hub
    echo        运行: docker login
    pause
    exit /b 1
)

echo.
echo ============================================
echo  完成！%FULL_TAG% 已推送到 Docker Hub
echo ============================================
echo.
pause
