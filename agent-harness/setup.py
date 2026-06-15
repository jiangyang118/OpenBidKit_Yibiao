from setuptools import find_namespace_packages, setup


setup(
    name="cli-anything-openbidkit-yibiao",
    version="0.1.0",
    description="Agent-native CLI harness for OpenBidKit Yibiao",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    include_package_data=True,
    package_data={"cli_anything.openbidkit_yibiao": ["skills/*.md", "scripts/*.cjs"]},
    install_requires=["click>=8.1"],
    entry_points={
        "console_scripts": [
            "cli-anything-openbidkit-yibiao=cli_anything.openbidkit_yibiao.openbidkit_yibiao_cli:main",
        ],
    },
    python_requires=">=3.9",
)
