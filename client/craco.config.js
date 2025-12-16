module.exports = {
  babel: {
    plugins: [
      [
        'babel-plugin-react-compiler',
        {
          // React Compiler 옵션
          // 자세한 옵션은 공식 문서 참조
        }
      ]
    ]
  },
  // DevServer allowedHosts 오류 방지
  devServer: {
    allowedHosts: 'all' // 빈 문자열 허용 오류 대응
  }
};

